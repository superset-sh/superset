#!/usr/bin/env python3
"""Generate a soundtrack (soft ambient pad + synced keyboard clicks) for the VHS demo.

The keyboard clicks are placed by replaying the .tape timeline: every `Type`
character costs `TypingSpeed`, every `Enter` is a keystroke, every `Sleep`
advances the clock, and the `Hide`..`Show` block is skipped (VHS doesn't render
it). No external assets — everything is synthesized with numpy.

Usage:  python3 gen_audio.py <tape> <out.wav> <duration_seconds>
"""
import re
import sys

import numpy as np

SR = 44100


# ---------------------------------------------------------------- tape timeline
def parse_events(tape_path):
    """Return (key_events, return_events) as lists of timestamps (seconds)."""
    typing_speed = 0.05  # VHS default 50ms; the tape overrides via `Set TypingSpeed`
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
            t = 0.0  # the rendered video starts here
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
            for ch in body:
                if not in_hidden:
                    keys.append((t, ch))
                t += typing_speed
            continue

        if head == "Enter":
            if not in_hidden:
                returns.append(t)
            t += typing_speed
            continue

        # Ctrl+L, Backspace, Tab, Space, Down, ... — single keystrokes
        if re.match(r"(Ctrl\+|Alt\+|Shift\+|Backspace|Tab|Space|Escape|Up|Down|Left|Right|PageUp|PageDown|Enter)", head):
            if not in_hidden:
                keys.append((t, "\x00"))
            t += typing_speed
            continue

    return keys, returns


# ------------------------------------------------------------------- synthesis
_rng = np.random.default_rng(7)


def _click(kind="key"):
    """A short percussive keystroke: noise transient + small resonant body."""
    if kind == "return":
        body_f = _rng.uniform(95, 120)
        dur, amp = 0.075, 0.95
        click_amp, noise_amp = 0.5, 0.35
    else:
        body_f = _rng.uniform(150, 235)
        dur, amp = 0.045, _rng.uniform(0.6, 0.85)
        click_amp, noise_amp = 0.45, 0.30

    n = int(SR * dur)
    tt = np.arange(n) / SR

    # noise transient (very short, sharp)
    nlen = int(SR * 0.006)
    noise = np.zeros(n)
    noise[:nlen] = _rng.standard_normal(nlen) * np.exp(-np.arange(nlen) / (nlen * 0.4))
    noise *= noise_amp

    # high "tick"
    tick = np.sin(2 * np.pi * _rng.uniform(2600, 3400) * tt) * np.exp(-tt / 0.004) * click_amp

    # low resonant body
    body = np.sin(2 * np.pi * body_f * tt) * np.exp(-tt / (dur * 0.5))

    sig = (noise + tick + body) * amp
    # gentle de-click envelope at the very start
    a = int(SR * 0.0008)
    sig[:a] *= np.linspace(0, 1, a)
    return sig.astype(np.float32)


def keyclick_track(keys, returns, total_len):
    buf = np.zeros(int(SR * total_len) + SR, dtype=np.float32)
    for t, _ch in keys:
        c = _click("key")
        i = int(t * SR)
        buf[i:i + len(c)] += c
    for t in returns:
        c = _click("return")
        i = int(t * SR)
        buf[i:i + len(c)] += c
    return buf[:int(SR * total_len)]


def pad_track(total_len):
    """Soft two-chord ambient pad: C major <-> A minor, 4s Hann-windowed swells."""
    n = int(SR * total_len)
    tt = np.arange(n) / SR
    seg = np.floor((tt % 8) / 4)  # 0 -> C, 1 -> Am
    # (root, third, fifth) for each chord
    f1 = np.where(seg == 0, 130.81, 220.00)
    f2 = np.where(seg == 0, 164.81, 261.63)
    f3 = np.where(seg == 0, 196.00, 329.63)
    env = 0.5 - 0.5 * np.cos(2 * np.pi * (tt % 4) / 4)  # 0 at chord boundaries
    voices = (
        np.sin(2 * np.pi * f1 * tt)
        + 0.85 * np.sin(2 * np.pi * f2 * tt)
        + 0.7 * np.sin(2 * np.pi * f3 * tt)
        # a touch of an octave shimmer
        + 0.25 * np.sin(2 * np.pi * f1 * 2 * tt)
    )
    pad = env * voices
    # one-pole low-pass for warmth
    a = np.exp(-2 * np.pi * 850 / SR)
    out = np.empty_like(pad)
    prev = 0.0
    for i in range(n):
        prev = (1 - a) * pad[i] + a * prev
        out[i] = prev
    # fades
    fi = int(SR * 2.5)
    out[:fi] *= np.linspace(0, 1, fi)
    fo = int(SR * 3.0)
    out[-fo:] *= np.linspace(1, 0, fo)
    return out.astype(np.float32)


def main():
    tape, out_wav, dur = sys.argv[1], sys.argv[2], float(sys.argv[3])
    keys, returns = parse_events(tape)
    print(f"  {len(keys)} keystrokes + {len(returns)} returns over {dur:.1f}s")

    clicks = keyclick_track(keys, returns, dur)
    pad = pad_track(dur)

    # balance: pad as a quiet bed, clicks present but not harsh
    mix = 0.20 * pad + 0.34 * clicks
    # soft-clip so stacked clicks don't slam the ceiling, then leave headroom
    mix = np.tanh(mix * 1.4) / np.tanh(1.4)
    mix *= 0.82
    pcm = (mix * 32767).astype(np.int16)

    import wave
    with wave.open(out_wav, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"  wrote {out_wav}")


if __name__ == "__main__":
    main()
