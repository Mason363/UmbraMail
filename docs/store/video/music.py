# The video's music, made here (nothing licensed): a slow, warm bed in D major whose chords change where the
# scenes do. A soft pad, an electric piano that rolls each chord and plays a few quiet notes, a low bass, a
# chime at each new scene, and a room around it all.   python3 music.py  →  assets/bed.wav
import numpy as np
from scipy.io import wavfile
from scipy.signal import fftconvolve, butter, sosfilt

SR = 48000
LENGTH = 44.0
rng = np.random.default_rng(7)
N = int(SR * LENGTH)
t_all = np.arange(N) / SR

def hz(note):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    n, o = note[:-1], int(note[-1])
    return 440.0 * 2 ** ((names[n] + 12 * (o + 1) - 69) / 12)

# where the scenes change (index.html): the chords change with them
CHORDS = [
    (0.0, "D2", ["A3", "D4", "F#4", "C#5", "E5"]),      # Dmaj9: the name
    (2.6, "G2", ["B3", "D4", "F#4", "A4"]),             # Gmaj9: what needs you
    (5.95, "E2", ["G3", "D4", "F#4", "B4"]),            # Em9
    (9.3, "B1", ["A3", "D4", "F#4", "C#5"]),            # Bm9: the tide
    (12.15, "G2", ["B3", "D4", "F#4", "A4"]),           # Gmaj7
    (15.0, "F#2", ["A3", "D4", "F#4", "E5"]),           # D/F#: a conversation
    (18.55, "E2", ["G3", "B3", "D4", "F#4"]),           # Em9
    (22.1, "G2", ["B3", "D4", "F#4", "A4"]),            # Gmaj9: finding
    (24.55, "A2", ["G3", "C#4", "E4", "B4"]),           # A13sus
    (27.0, "B1", ["A3", "D4", "F#4", "C#5"]),           # Bm9: the paper
    (29.45, "G2", ["B3", "D4", "F#4", "C#5"]),          # Gmaj7#11
    (31.9, "E2", ["G3", "D4", "F#4", "B4"]),            # Em9: colors and pictures
    (35.55, "A2", ["G3", "C#4", "E4", "B4"]),           # A13sus
    (39.2, "D2", ["A3", "D4", "F#4", "C#5", "E5"]),     # Dmaj9: the end, and rest
]
ends = [c[0] for c in CHORDS[1:]] + [LENGTH]

def env_ar(n, a, r, sustain_n):
    e = np.ones(n)
    an, rn = int(a * SR), int(r * SR)
    e[:an] = np.linspace(0, 1, an) ** 2 if an else 1
    if sustain_n + rn < n: e[sustain_n + rn:] = 0
    if rn: e[sustain_n:sustain_n + rn] *= np.linspace(1, 0, min(rn, max(0, n - sustain_n)))[: max(0, min(rn, n - sustain_n))] if sustain_n < n else 1
    return e

out = np.zeros((N, 2))

def place(sig, start, pan=0.0, gain=1.0):
    i = int(start * SR)
    j = min(N, i + len(sig))
    if j <= i: return
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    out[i:j, 0] += sig[: j - i] * l * gain
    out[i:j, 1] += sig[: j - i] * r * gain

# ---- pad: three slightly detuned voices per note, soft harmonics, slow in and out
def pad_note(f, dur):
    n = int((dur + 2.2) * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for det in (-5, 0, 6):
        ff = f * 2 ** (det / 1200)
        ph = rng.uniform(0, 2 * np.pi)
        for k in range(1, 9):
            s += np.sin(2 * np.pi * ff * k * t + ph * k) / k ** 1.7
    e = np.minimum(1, t / 1.4) ** 1.5
    e *= np.where(t > dur, np.exp(-(t - dur) / 0.8), 1)
    return s * e * 0.06

for (start, bass, notes), end in zip(CHORDS, ends):
    for i, nm in enumerate(notes[:4]):
        place(pad_note(hz(nm), end - start), start, pan=(-0.5 + i / 3), gain=0.42)

# ---- bass: a round sine on the root, a little second harmonic
for (start, bass, notes), end in zip(CHORDS, ends):
    f = hz(bass)
    dur = end - start
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(4 * np.pi * f * t)
    e = np.minimum(1, t / 0.5) * np.where(t > dur, np.exp(-(t - dur) / 0.35), 1)
    place(s * e * 0.04, start, gain=1.0)

# ---- electric piano: a sine bent by a sine (FM, the tine's bell fading out), each chord rolled up
def ep(f, vel=1.0, length=3.2):
    n = int(length * SR)
    t = np.arange(n) / SR
    idx = 1.6 * np.exp(-t * 4.0) + 0.25
    s = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    s += 0.12 * np.sin(2 * np.pi * f * 7.02 * t) * np.exp(-t * 18)        # the tine's tick
    e = np.minimum(1, t / 0.004) * np.exp(-t * 1.25) * (1 - np.exp(-t * 400))
    return s * e * 0.1 * vel

for (start, bass, notes), end in zip(CHORDS, ends):
    if start == 0.0: continue  # (the name: the pad alone)
    for i, nm in enumerate(notes):
        place(ep(hz(nm), 1.0 - i * 0.08), start + 0.02 + i * 0.045, pan=-0.35 + i * 0.18)

# a few quiet notes on top, from the scale, between the chords
MELODY = [(3.9, "F#5"), (4.8, "A5"), (7.0, "B5"), (10.4, "C#6"), (11.3, "A5"), (13.4, "F#5"), (16.3, "E5"), (17.0, "F#5"),
          (19.9, "B5"), (23.2, "A5"), (25.6, "E5"), (28.2, "F#5"), (28.9, "C#6"), (30.6, "B5"), (33.0, "A5"), (33.8, "B5"),
          (36.4, "C#6"), (40.3, "A5"), (41.2, "F#5")]
for when, nm in MELODY:
    place(ep(hz(nm), 0.62, 3.6), when, pan=0.25, gain=1.0)

# ---- a soft arpeggio through each chord (eighth notes, 92 a minute), from the first screen until the end card
step = 60 / 92 / 2
t = 2.6
k = 0
while t < 39.2 - 0.05:
    chord = [c for c in CHORDS if c[0] <= t + 1e-6][-1]
    tones = chord[2][1:4] + [chord[2][2]]
    nm = tones[k % len(tones)]
    f = hz(nm) * 2
    accent = 1.0 if k % 4 == 0 else 0.72
    place(ep(f, 0.3 * accent, 1.4), t, pan=0.5 * np.sin(k * 0.7), gain=1.0)
    t += step
    k += 1

# ---- a chime as each scene arrives: two high partials, very soft
def chime(f):
    n = int(3.0 * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 3)
    return s * np.minimum(1, t / 0.006) * np.exp(-t * 1.6) * 0.035

for when, nm in [(2.6, "A6"), (9.3, "F#6"), (15.0, "A6"), (22.1, "B6"), (27.0, "F#6"), (31.9, "A6"), (39.2, "A6")]:
    place(chime(hz(nm)), when, pan=0.4)

# ---- the room: a long, dark, wide reverb
ir_n = int(3.2 * SR)
ti = np.arange(ir_n) / SR
sos = butter(2, 3800, "low", fs=SR, output="sos")
ir = np.stack([sosfilt(sos, rng.standard_normal(ir_n)) * np.exp(-ti / 0.85) for _ in range(2)], axis=1)
ir[: int(0.012 * SR)] = 0  # (a moment before the room answers)
ir /= np.sqrt((ir ** 2).sum(axis=0))
wet = np.stack([fftconvolve(out[:, c], ir[:, c])[:N] for c in range(2)], axis=1)
mix = out * 0.72 + wet * 0.55

# warm the top, keep the very bottom clean
mix = sosfilt(butter(2, 9000, "low", fs=SR, output="sos"), mix, axis=0)
mix = sosfilt(butter(2, 45, "high", fs=SR, output="sos"), mix, axis=0)

# in and out: a short fade in, a long one at the end
fade_in = np.minimum(1, t_all / 0.6)
fade_out = np.clip((LENGTH - t_all) / 3.4, 0, 1) ** 1.6
mix *= (fade_in * fade_out)[:, None]

# gentle level: a soft knee on the peaks, then to −1 dBFS
mix = np.tanh(mix * 1.6) / 1.6
mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))
wavfile.write("assets/bed-raw.wav", SR, (mix * 32767).astype(np.int16))
# then to −16 LUFS, a calm level for a bed with nothing over it (ffmpeg's loudnorm, linear, two passes)
import json, subprocess
m = subprocess.run(["ffmpeg", "-hide_banner", "-i", "assets/bed-raw.wav", "-af", "loudnorm=I=-16:TP=-2:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
m = json.loads(m[m.rindex("{"):m.rindex("}") + 1])
af = "loudnorm=I=-16:TP=-2:LRA=11:linear=true:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s" % (m["input_i"], m["input_tp"], m["input_lra"], m["input_thresh"], m["target_offset"])
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "assets/bed-raw.wav", "-af", af, "-ar", str(SR), "assets/bed.wav"], check=True)
import os; os.remove("assets/bed-raw.wav")
print("assets/bed.wav", round(LENGTH, 1), "s")
