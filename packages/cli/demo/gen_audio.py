#!/usr/bin/env python3
"""Generate a keyboard-click track for the VHS demo, timed off the .tape script.

Clicks are placed by replaying the .tape timeline: every `Type` character costs
`TypingSpeed`, every `Enter` is a keystroke, every `Sleep` advances the clock,
and the `Hide`..`Show` block is skipped (VHS doesn't render it).

The click sound is synthesized with numpy by default. Pass a WAV (a single
keystroke) or a directory of WAVs (a pool of keystrokes — picked at random per
key) to use real recordings instead; each hit gets slight pitch/level jitter.

Usage:  python3 gen_audio.py <tape> <out.wav> <duration_seconds> [keys.wav|keys_dir] [keyreturn.wav]
"""
import os
import re
import sys
import wave

import numpy as np

SR = 44100
_rng = np.random.default_rng(7)


# ---------------------------------------------------------------- tape timeline
def parse_events(tape_path):
    typing_speed = 0.05  # VHS default; tape overrides via `Set TypingSpeed`
    t = 0.0
    in_hidden = False
    keys, returns = [], []

    for raw in open(tape_path, encoding="utf-8"):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        head = line.split(None, 1)[0]

        if head == "Hide":
            in_hidden = True
            continue
        if head == "Show":
            in_hidden = False
            t = 0.0
            continue

        m = re.match(r"Set\s+TypingSpeed\s+([\d.]+)(ms|s)?", line)
        if m:
            typing_speed = float(m.group(1)) / (1000 if m.group(2) == "ms" else 1)
            continue
        if head in ("Set", "Output", "Require", "Env"):
            continue

        m = re.match(r"Sleep\s+([\d.]+)(ms|s)?", line)
        if m:
            dt = float(m.group(1)) / (1000 if (m.group(2) or "s") == "ms" else 1)
            if not in_hidden:
                t += dt
            continue

        if head == "Type":
            body = line[len("Type"):].strip()
            if len(body) >= 2 and body[0] in "\"'`" and body[-1] == body[0]:
                body = body[1:-1]
            for _ch in body:
                if not in_hidden:
                    keys.append(t)
                t += typing_speed
            continue

        if head == "Enter":
            if not in_hidden:
                returns.append(t)
            t += typing_speed
            continue

        if re.match(r"(Ctrl\+|Alt\+|Shift\+|Backspace|Tab|Space|Escape|Up|Down|Left|Right|PageUp|PageDown)", head):
            if not in_hidden:
                keys.append(t)
            t += typing_speed
            continue

    return keys, returns


# --------------------------------------------------------------------- samples
def _load_wav_mono(path):
    with wave.open(path, "rb") as w:
        n, sw, ch, fr = w.getnframes(), w.getsampwidth(), w.getnchannels(), w.getframerate()
        raw = w.readframes(n)
    dt = {1: np.int8, 2: np.int16, 4: np.int32}[sw]
    a = np.frombuffer(raw, dtype=dt).astype(np.float32)
    if sw == 1:
        a = (a - 128) / 128.0
    else:
        a /= float(np.iinfo(dt).max)
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    if fr != SR:  # cheap linear resample
        idx = np.linspace(0, len(a) - 1, int(len(a) * SR / fr))
        a = np.interp(idx, np.arange(len(a)), a)
    # trim leading silence so the transient lands on the timestamp
    thr = 0.02 * (np.max(np.abs(a)) or 1.0)
    nz = np.argmax(np.abs(a) > thr)
    return a[nz:]


def _jitter(sample, semitones=1.5, gain_db=2.5):
    sp = 2 ** (_rng.uniform(-semitones, semitones) / 12)
    idx = np.arange(0, len(sample), sp)
    s = np.interp(idx, np.arange(len(sample)), sample)
    return s * (10 ** (_rng.uniform(-gain_db, gain_db) / 20))


# ---------------------------------------------------------- synthesized clicks
def _synth_click(kind="key"):
    if kind == "return":
        body_f, dur, amp = _rng.uniform(95, 120), 0.075, 0.95
        click_amp, noise_amp = 0.5, 0.35
    else:
        body_f, dur, amp = _rng.uniform(150, 235), 0.045, _rng.uniform(0.6, 0.85)
        click_amp, noise_amp = 0.45, 0.30
    n = int(SR * dur)
    tt = np.arange(n) / SR
    nlen = int(SR * 0.006)
    noise = np.zeros(n)
    noise[:nlen] = _rng.standard_normal(nlen) * np.exp(-np.arange(nlen) / (nlen * 0.4))
    noise *= noise_amp
    tick = np.sin(2 * np.pi * _rng.uniform(2600, 3400) * tt) * np.exp(-tt / 0.004) * click_amp
    body = np.sin(2 * np.pi * body_f * tt) * np.exp(-tt / (dur * 0.5))
    sig = (noise + tick + body) * amp
    a = int(SR * 0.0008)
    sig[:a] *= np.linspace(0, 1, a)
    return sig.astype(np.float32)


def _load_pool(path):
    """path may be a single WAV or a directory of WAVs. Returns a list of arrays."""
    if not path or not os.path.exists(path):
        return []
    if os.path.isdir(path):
        files = sorted(f for f in os.listdir(path) if f.lower().endswith(".wav"))
        return [_load_wav_mono(os.path.join(path, f)) for f in files]
    return [_load_wav_mono(path)]


# Don't fire a key click within this gap of the previous one — keeps fast
# on-screen typing from sounding like a machine gun (the audio "types" calmer).
CLICK_MIN_GAP = 0.09


def _thin(times, min_gap):
    out, last = [], -1e9
    for t in times:
        if t - last >= min_gap:
            out.append(t)
            last = t
    return out


def build_track(keys, returns, total_len, key_pool, ret_pool):
    buf = np.zeros(int(SR * total_len) + SR, dtype=np.float32)

    def place(times, pool, kind, gain=1.0):
        for t in times:
            if pool:
                c = _jitter(pool[_rng.integers(len(pool))]) * gain
            else:
                c = _synth_click(kind)
            i = int(t * SR)
            buf[i:i + len(c)] += c

    place(_thin(keys, CLICK_MIN_GAP), key_pool, "key")
    # Enter: prefer a dedicated return sample; else reuse the keypress pool a touch louder
    place(returns, ret_pool or key_pool, "return", gain=1.15 if not ret_pool else 1.0)
    return buf[:int(SR * total_len)]


def main():
    tape, out_wav, dur = sys.argv[1], sys.argv[2], float(sys.argv[3])
    key_path = sys.argv[4] if len(sys.argv) > 4 else None
    ret_path = sys.argv[5] if len(sys.argv) > 5 else None

    key_pool = _load_pool(key_path)
    ret_pool = _load_pool(ret_path)
    src = f"sample pool x{len(key_pool)}" if key_pool else "synth"

    keys, returns = parse_events(tape)
    print(f"  {len(keys)} keystrokes + {len(returns)} returns over {dur:.1f}s ({src} clicks)")

    track = build_track(keys, returns, dur, key_pool, ret_pool)
    peak = float(np.max(np.abs(track))) or 1.0
    track = (track / peak) * 0.9  # leave headroom for the music mix downstream
    pcm = (track * 32767).astype(np.int16)

    with wave.open(out_wav, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"  wrote {out_wav}")


if __name__ == "__main__":
    main()
