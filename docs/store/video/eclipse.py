# The eclipse at each end of the video, frame by frame: a close-up of the sun in totality, its corona and the red of
# its rim around the moon; the moon moving all the while, the first light breaking out at its edge (the diamond ring),
# and the face of the sun coming back with Umbra's name on it, dark like the moon, left behind.
#   python3 eclipse.py            →  assets/clips/eclipse-intro.mp4 and eclipse-outro.mp4
#   python3 eclipse.py stills     →  a few frames of each, to look at (renders/eclipse-*.png)
# Two real pictures, both public domain, from Wikimedia Commons (node make.mjs photos fetches them into assets/sun/):
#   the face: the Sun on 10 August 2024 in visible light, NASA/SDO/HMI ("SDO 20240810 000000 4096 HMIIC (HMI).jpg")
#   the diamond ring: the eclipse of 21 August 2017, NASA/Aubrey Gemignani ("2017 Total Solar Eclipse (NHQ201708210102).jpg")
# The words are masks drawn by the browser in Umbra's own type (node make.mjs clips eclipse).
import subprocess, sys
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.ndimage import gaussian_filter, map_coordinates

W, H, FPS = 1920, 1080, 60
CX, CY, R = 960.0, 540.0, 400.0        # the sun: a close-up, most of the frame's height
RM = 416.0                             # the moon, a little larger: totality
BG = np.array([9, 9, 11], np.float32) / 255   # the page; the moon and the words are this dark too
MOVE = np.radians(-8)                  # the moon's way: a little upward, to the right
U = np.array([np.cos(MOVE), np.sin(MOVE)])

# the moon never stops: it drifts across the sun from the first frame, gathers speed after the light breaks out,
# and glides on out of the picture (once off the sun it's as dark as the sky)
D0, V0, VMAX, RAMP = -16.0, 40.0, 620.0, (0.7, 2.1)
def smoother(x):
    x = np.clip(x, 0, 1)
    return x * x * x * (x * (6 * x - 15) + 10)
_ts = np.linspace(0, 8, 8001)
_v = V0 + (VMAX - V0) * smoother((_ts - RAMP[0]) / (RAMP[1] - RAMP[0]))
_d = D0 + np.concatenate([[0], np.cumsum((_v[1:] + _v[:-1]) / 2 * np.diff(_ts))])
def travel(t): return float(np.interp(t, _ts, _d))
T3 = float(np.interp(RM - R, _d, _ts))              # when the moon's edge first leaves the sun's

# the two clips: when the light comes up, and when it all goes dark
CLIPS = {"intro": dict(length=4.8, rise=(0.0, 0.7), fade=(4.1, 4.8)),
         "outro": dict(length=7.0, rise=(0.0, 0.7), fade=(6.3, 7.0))}

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

# ---- the face: the real Sun, turned so its spots lie on a diagonal, brought down to our size. The few spots that would
# sit against the words are covered with the Sun's own surface from elsewhere at the same distance from its centre
# (the same brightness there: the face darkens evenly toward its edge), so it stays a photograph throughout
inside = np.clip(R - r + 0.5, 0, 1).astype(np.float32)
FACE_SRC, FACE_C, FACE_R, FACE_TURN = "assets/sun/face.jpg", 2047.7, 1876.5, 315
def turned(img, deg):
    """an H × W × 3 picture turned about the sun's centre"""
    a = np.radians(deg)
    sx = CX + np.cos(a) * dx - np.sin(a) * dy
    sy = CY + np.sin(a) * dx + np.cos(a) * dy
    return np.stack([map_coordinates(img[..., c], [sy, sx], order=1) for c in range(3)], -1)
def load_face():
    src = Image.open(FACE_SRC).convert("RGB").rotate(FACE_TURN, resample=Image.BICUBIC, center=(FACE_C, FACE_C))
    box = (FACE_C - FACE_R * 1.02, FACE_C - FACE_R * 1.02, FACE_C + FACE_R * 1.02, FACE_C + FACE_R * 1.02)
    side = int(round(2 * R * 1.02))
    face = np.asarray(src.resize((side, side), Image.LANCZOS, box=box), np.float32) / 255
    out = np.zeros((H, W, 3), np.float32)
    x0, y0 = int(round(CX - side / 2)), int(round(CY - side / 2))
    out[y0:y0 + side, x0:x0 + side] = face
    lum = out.mean(2)
    surface = ndimage.median_filter(lum, size=41)
    spots = ndimage.binary_opening((lum < surface * 0.92) & (rho < 0.97), iterations=1)
    spots = ndimage.binary_dilation(spots, iterations=5)
    words = np.zeros((H, W), bool)
    for k in CLIPS:
        words |= np.asarray(Image.open(f"assets/eclipse/words-{k}.png").convert("L")) > 60
    lab, n = ndimage.label(spots)
    near_words = ndimage.binary_dilation(words, iterations=34)
    cover = np.isin(lab, [i for i in range(1, n + 1) if (near_words & (lab == i)).any()])
    if cover.any():
        for deg in range(40, 360, 20):                    # a turn of the face that puts clean surface there
            if not (turned(spots[..., None].astype(np.float32).repeat(3, -1), deg)[..., 0] > 0.1)[cover].any():
                patch = turned(out, deg)
                m = gaussian_filter(cover.astype(np.float32), 2.0)[..., None]
                out = out * (1 - m) + patch * m
                break
    return out * inside[..., None]
FACE_AREA = float(inside.sum())

# ---- the diamond ring: the real one, its moon laid on ours and turned so the light breaks out where ours does
RING_SRC, RING_C, RING_R = "assets/sun/ring.jpg", (1539.5, 1041.5), 565.0
ring_img = np.asarray(Image.open(RING_SRC).convert("RGB"), np.float32) / 255
ring_img = gaussian_filter(ring_img, (0.7, 0.7, 0))      # (it's brought down a little: no shimmer in its fine rays)
ring_dir = np.array([1295.0 - RING_C[0], 1495.8 - RING_C[1]]); ring_dir /= np.linalg.norm(ring_dir)
turn = np.arctan2(-U[1], -U[0]) - np.arctan2(ring_dir[1], ring_dir[0])   # its light's way onto ours (behind the moon's path)
BEAD = np.array([CX, CY]) - R * U
def ring_layer(moon_c):
    """the photo, placed on the moon where it is now, only near where the light breaks out"""
    x0, x1 = max(0, int(BEAD[0] - 460)), int(BEAD[0] + 460)
    y0, y1 = max(0, int(BEAD[1] - 460)), int(BEAD[1] + 460)
    px, py = xx[y0:y1, x0:x1] - moon_c[0], yy[y0:y1, x0:x1] - moon_c[1]
    k = RING_R / RM
    c, s = np.cos(-turn), np.sin(-turn)
    sx, sy = RING_C[0] + k * (c * px - s * py), RING_C[1] + k * (s * px + c * py)
    out = np.zeros((y1 - y0, x1 - x0, 3), np.float32)
    for ch in range(3):
        out[..., ch] = map_coordinates(ring_img[..., ch], [sy, sx], order=1, mode="constant", cval=0)
    q = np.hypot(xx[y0:y1, x0:x1] - BEAD[0], yy[y0:y1, x0:x1] - BEAD[1])
    out *= np.clip(1 - (q / 440) ** 2, 0, 1)[..., None] ** 1.5
    return (slice(y0, y1), slice(x0, x1)), out

def soft(x):
    """film-like: true up to 0.8, then rolling off toward white"""
    return np.where(x < 0.8, x, 0.8 + 0.2 * (1 - np.exp(-(x - 0.8) / 0.2)))

def moon_at(t):
    d = travel(t)
    return np.array([CX + d * U[0], CY + d * U[1]]), d

def moon_mask(t):
    """the moon's disc, with the blur of its own movement over half a frame"""
    m = np.zeros((H, W), np.float32)
    for s in np.linspace(-0.25, 0.25, 7):
        c, _ = moon_at(t + s / FPS)
        m += np.clip(RM - np.hypot(xx - c[0], yy - c[1]) + 0.5, 0, 1)
    return m / 7

def frame(t, face, words, c, dither):
    moon = moon_mask(t)
    sky = 1 - moon
    shown = inside * sky
    a = float(shown.sum()) / FACE_AREA                  # how much of the face is out
    up = ease(t, *c["rise"])
    # the first light out burns white for a moment, then the camera stops down: the corona goes, the face settles
    flash = ease(t, T3, T3 + 0.1) * np.exp(-max(0.0, t - T3 - 0.1) / 0.25)
    corona_on = up * np.exp(-a / 0.035) * (1 - 0.65 * flash)
    # (too much light goes white, the way film does, not to a brighter yellow)
    burn = 6 * flash + 2 * np.exp(-a / 0.004)
    lit = face * (shown * (1 - words))[..., None]
    sun = lit * (1 + burn) + (lit.mean(2, keepdims=True) * 0.9 * burn)
    light = sun + (CORONA * (1 - 0.75 * PROM)[..., None] + RIM) * (corona_on * (1 - inside) * sky)[..., None]
    out = soft(light)
    if flash > 0.004:                                   # the real diamond ring, over ours: it only ever adds light
        where, photo = ring_layer(moon_at(t)[0])
        out[where] = np.maximum(out[where], photo * min(1.0, flash * 1.15))
    out *= 1 - ease(t, *c["fade"])
    return np.clip(BG + out + dither, 0, 1)

def render(name, stills=None):
    c = CLIPS[name]
    words = np.asarray(Image.open(f"assets/eclipse/words-{name}.png").convert("L"), np.float32) / 255
    face = load_face()
    if stills:
        for t in stills:
            img = frame(t, face, words, c, 0)
            Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save(f"renders/eclipse-{name}-{t:.2f}.png")
        return
    n = int(round(c["length"] * FPS))
    out = f"assets/clips/eclipse-{name}.mp4"
    enc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-crf", "12", "-preset", "slow", "-g", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    noise = np.random.default_rng(5)
    for i in range(n):
        dither = (noise.random((H, W, 1), np.float32) - 0.5) / 255   # (so the long glows don't band)
        img = frame(i / FPS, face, words, c, dither)
        enc.stdin.write((img * 255 + 0.5).astype(np.uint8).tobytes())
    enc.stdin.close()
    enc.wait()
    print("  " + out, n, "frames")

if __name__ == "__main__":
    print(f"  the light breaks out at {T3:.2f} s; the moon is off the sun by {float(np.interp(R + RM, _d, _ts)):.2f} s")
    if sys.argv[1:2] == ["stills"]:
        render("intro", [0.3, T3 - 0.05, T3 + 0.05, T3 + 0.12, T3 + 0.25, T3 + 0.45, 1.6, 2.2, 3.4])
    else:
        for name in CLIPS:
            render(name)
