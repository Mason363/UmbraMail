# The eclipse at each end of the video, drawn frame by frame (nothing licensed): a close-up of the sun in totality,
# its corona and the red of its rim around the moon; then the moon moves off, the first light breaks out at its edge
# (the diamond ring), and the face of the sun comes back with Umbra's name on it, dark like the moon, left behind.
#   python3 eclipse.py            →  assets/clips/eclipse-intro.mp4 and eclipse-outro.mp4
#   python3 eclipse.py stills     →  a few frames of each, to look at (renders/eclipse-*.png)
# The words are masks drawn by the browser in Umbra's own type (make.mjs: node make.mjs clips eclipse).
import subprocess, sys
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

W, H, FPS = 1920, 1080, 60
CX, CY, R = 960.0, 540.0, 400.0        # the sun: a close-up, most of the frame's height
RM = 412.0                             # the moon, a little larger: totality
BG = np.array([9, 9, 11], np.float32) / 255   # the page; the moon and the words are this dark too
MOVE = np.radians(-8)                  # the moon leaves a little upward, to the right
U = np.array([np.cos(MOVE), np.sin(MOVE)])
TRAVEL = 1000.0

# the two clips: when the light comes up, when the moon moves and how far, when it all goes dark
CLIPS = {
    "intro": dict(length=4.8, rise=(0.05, 1.0), move=(1.1, 3.3), fade=(4.1, 4.8)),
    "outro": dict(length=7.0, rise=(0.05, 1.0), move=(1.1, 3.3), fade=(6.3, 7.0)),
}

rng = np.random.default_rng(23)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
dx, dy = xx - CX, yy - CY
r = np.hypot(dx, dy)
th = np.arctan2(dy, dx)
rho = r / R

def ring(fmin, fmax, slope, n=8192):
    """smooth noise around a circle: random waves, the finer ones fainter, scaled to 0..1"""
    a = np.linspace(0, 2 * np.pi, n, endpoint=False)
    s = np.zeros(n)
    for f in range(fmin, fmax + 1):
        s += rng.normal() * f ** (-slope) * np.cos(f * a + rng.uniform(0, 2 * np.pi))
    return ((s - s.min()) / (s.max() - s.min())).astype(np.float32)

def at(table, ang):
    u = (ang / (2 * np.pi)) % 1.0 * len(table)
    i = np.floor(u).astype(np.int32)
    f = u - i
    return table[i % len(table)] * (1 - f) + table[(i + 1) % len(table)] * f

def near(ang, a, w):
    d = np.angle(np.exp(1j * (ang - a)))
    return np.exp(-0.5 * (d / w) ** 2)

def ease(t, a, b):
    x = np.clip((t - a) / (b - a), 0, 1)
    return (1 - np.cos(np.pi * x)) / 2

# ---- the corona: fine rays everywhere, long tapering streamers near the equator, short plumes at the poles
ri = np.maximum(rho, 1.0)
bend = at(ring(2, 9, 1.0), th) - 0.5
tw = th + 0.22 * bend * (ri - 1)                       # the rays curve a little as they go out
fine, mid, plume = ring(30, 520, 0.55), ring(5, 60, 0.9), ring(60, 400, 0.4)
rays = 0.5 + 0.5 * at(fine, tw) ** 1.4
broad = 0.55 + 0.45 * at(mid, tw)
streams = np.zeros_like(r)
for a, w, amp, reach in [(-0.18, 0.20, 1.0, 1.15), (0.32, 0.12, 0.55, 0.8), (np.pi + 0.12, 0.24, 0.95, 1.05),
                         (np.pi - 0.42, 0.13, 0.6, 0.75), (-0.75, 0.09, 0.35, 0.6), (np.pi + 0.8, 0.1, 0.4, 0.55)]:
    taper = w / (1 + 1.6 * (ri - 1))                   # streamers narrow to points
    streams += amp * near(tw, a, taper) * np.exp(-(ri - 1) / reach)
polar = near(th, -np.pi / 2, 0.55) + near(th, np.pi / 2, 0.55)   # the poles: thinner, with fine plumes
poles = polar * at(plume, tw) ** 3 * ri ** -5
corona = (0.55 * ri ** -10 * (0.75 + 0.25 * rays)                    # the bright inner ring
          + 0.42 * ri ** -4.5 * (0.25 + 0.75 * rays) * broad * (1 - 0.55 * polar)
          + 1.1 * streams * ri ** -2.0 * (0.55 + 0.45 * rays)
          + 0.8 * poles + 0.05 * ri ** -2.5)
corona = (corona * (rho >= 0.995)).astype(np.float32)
CORONA = np.stack([corona * 1.0, corona * 0.97, corona * 0.93], -1)

# ---- the rim: a thin red layer, and a few prominences standing off it
h = r - R
tall = np.zeros_like(r)
for a, w, ht in [(-2.45, 0.04, 46), (-1.2, 0.025, 30), (0.55, 0.035, 40), (1.9, 0.03, 34), (2.75, 0.045, 50), (-0.2, 0.02, 26)]:
    tall += ht * near(th, a, w)
flame = 0.45 + 0.55 * at(ring(80, 700, 0.3), th + 0.002 * h)
prom = np.clip(1 - h / np.maximum(tall, 1e-3), 0, 1) ** 1.6 * flame * (tall > 2) * (h > 0)
rim = np.exp(-np.maximum(h, 0) / 2.5) * (h > -0.5)
PROM = np.maximum(prom, rim * 0.8).astype(np.float32)
RIM = PROM[..., None] * np.array([1.7, 0.42, 0.6], np.float32)

# ---- the face, as through a filter: amber, darker and redder to the edge, with the fine grain of its surface, and a spot
inside = np.clip(R - r + 0.5, 0, 1).astype(np.float32)
mu = np.sqrt(np.clip(1 - rho ** 2, 0, 1))
limb = 1 - 0.62 * (1 - mu) - 0.22 * (1 - mu) ** 2
centre_c, edge_c = np.array([1.0, 0.60, 0.20]), np.array([0.78, 0.24, 0.05])
k = mu[..., None] ** 0.6
face = (edge_c * (1 - k) + centre_c * k) * limb[..., None]
grain = gaussian_filter(rng.normal(size=(H, W)), 1.4); grain /= grain.std()
cells = gaussian_filter(rng.normal(size=(H, W)), 14); cells /= cells.std()
face *= (1 + (0.035 * grain + 0.02 * cells) * mu)[..., None]
for (px, py), ru, rp in [((CX + 192, CY - 254), 7.5, 17.0), ((CX + 226, CY - 236), 3.5, 8.0)]:
    n = np.array([px - CX, py - CY]); n /= np.linalg.norm(n)
    mup = np.sqrt(max(0.0, 1 - ((px - CX) ** 2 + (py - CY) ** 2) / R ** 2))
    a = ((xx - px) * n[0] + (yy - py) * n[1]) / mup    # spots near the edge are seen at a slant
    b = -(xx - px) * n[1] + (yy - py) * n[0]
    d = np.hypot(a, b)
    face *= (1 - 0.38 * np.clip(rp + 0.8 - d, 0, 1) - 0.42 * np.clip(ru + 0.8 - d, 0, 1))[..., None]
FACE = (face * inside[..., None]).astype(np.float32)
FACE_AREA = float(inside.sum())

def blur(img, sigma):
    """a wide blur, done small: 4 × smaller, then back up"""
    s = img.reshape(H // 4, 4, W // 4, 4, 3).mean((1, 3))
    s = gaussian_filter(s, (sigma / 4, sigma / 4, 0))
    return np.stack([np.asarray(Image.fromarray(s[..., c]).resize((W, H), Image.BILINEAR)) for c in range(3)], -1)

def soft(x):
    """film-like: true up to 0.8, then rolling off toward white"""
    return np.where(x < 0.8, x, 0.8 + 0.2 * (1 - np.exp(-(x - 0.8) / 0.2)))

def moon_mask(t, move):
    """the moon's disc, with the blur of its own movement over half a frame"""
    m = np.zeros((H, W), np.float32)
    for s in np.linspace(-0.25, 0.25, 7):
        d = TRAVEL * ease(t + s / FPS, *move)
        mx, my = CX + d * U[0], CY + d * U[1]
        m += np.clip(RM - np.hypot(xx - mx, yy - my) + 0.5, 0, 1)
    return m / 7, TRAVEL * ease(t, *move)

BEAD = (CX - R * U[0], CY - R * U[1])   # where the light first breaks out: the sun's rim, behind the moon's way

def first_light(move):
    """when the moon's edge first leaves the sun's: it has to travel the difference of their sizes"""
    t = move[0]
    while TRAVEL * ease(t, *move) < RM - R: t += 0.0005
    return t

def frame(t, words, c, dither):
    moon, d = moon_mask(t, c["move"])
    t3 = first_light(c["move"])
    sky = 1 - moon
    shown = inside * sky
    a = float(shown.sum()) / FACE_AREA                  # how much of the face is out
    # the light comes up from black. The first light out burns white for a moment (the diamond ring: a bead on the
    # rim where it breaks out, and a glow); then the camera stops down: the corona goes, and the face settles to amber
    up = ease(t, *c["rise"])
    ring = ease(t, t3, t3 + 0.12) * np.exp(-max(0.0, t - t3 - 0.12) / 0.2)
    corona_on = up * np.exp(-a / 0.035)
    sun = FACE * (shown * (1 - words))[..., None] * (1 + 9 * ring + 3 * np.exp(-a / 0.004))
    light = sun + (CORONA * (1 - 0.75 * PROM)[..., None] + RIM) * (corona_on * (1 - inside) * sky)[..., None]   # (the prominences stand in front of the corona)
    glow = blur(light, 10) * 0.05 + blur(light, 40) * 0.035 + blur(light, 120) * 0.025
    if ring > 0.002:
        glow += (blur(sun, 10) * 0.35 + blur(sun, 40) * 0.4 + blur(sun, 120) * 0.25) * ring
        q = np.hypot(xx - BEAD[0], yy - BEAD[1])
        bead = ring ** 1.6 * (3.2 * np.exp(-q / 7) + 1.0 * np.exp(-q / 30) + 0.35 * np.exp(-q / 110) + 0.08 * np.exp(-q / 360))
        glow += bead[..., None] * np.array([1.0, 0.96, 0.9], np.float32)
    out = soft(light + glow)
    out *= 1 - ease(t, *c["fade"])
    return np.clip(BG + out + dither, 0, 1)

def render(name, stills=None):
    c = CLIPS[name]
    words = np.asarray(Image.open(f"assets/eclipse/words-{name}.png").convert("L"), np.float32) / 255
    if stills:
        for t in stills:
            img = frame(t, words, c, 0)
            Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save(f"renders/eclipse-{name}-{t:.2f}.png")
            print("  renders/eclipse-%s-%.2f.png" % (name, t))
        return
    n = int(round(c["length"] * FPS))
    out = f"assets/clips/eclipse-{name}.mp4"
    enc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-crf", "12", "-preset", "slow", "-g", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    noise = np.random.default_rng(5)
    for i in range(n):
        dither = (noise.random((H, W, 1), np.float32) - 0.5) / 255   # (so the long glows don't band)
        img = frame(i / FPS, words, c, dither)
        enc.stdin.write((img * 255 + 0.5).astype(np.uint8).tobytes())
    enc.stdin.close()
    enc.wait()
    print("  " + out, n, "frames")

if __name__ == "__main__":
    if sys.argv[1:2] == ["stills"]:
        render("intro", [1.2, 1.3, 1.36, 1.44, 1.52, 1.62, 1.75, 2.1, 2.6])
        render("outro", [3.6])
    else:
        for name in CLIPS:
            render(name)
