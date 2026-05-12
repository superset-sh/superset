#!/usr/bin/env python3
"""Slice individual keystroke samples out of a continuous typing recording.

Detects transients in <src.wav> and writes one short WAV per keystroke into
<out_dir>/keyNN.wav (1 ms fade-in, ~20 ms fade-out so the edges don't click).

Usage:  python3 extract_keys.py <src.wav> <out_dir>
"""
import os
import sys
import wave

import numpy as np

SR = 44100


def load_mono(path):
    with wave.open(path, "rb") as w:
        n, sw, ch, fr = w.getnframes(), w.getsampwidth(), w.getnchannels(), w.getframerate()
        raw = w.readframes(n)
    dt = {1: np.int8, 2: np.int16, 4: np.int32}[sw]
    a = np.frombuffer(raw, dtype=dt).astype(np.float32)
    a = (a - 128) / 128.0 if sw == 1 else a / float(np.iinfo(dt).max)
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    if fr != SR:
        idx = np.linspace(0, len(a) - 1, int(len(a) * SR / fr))
        a = np.interp(idx, np.arange(len(a)), a)
    return a


def detect_onsets(a, min_gap=0.06, thr_frac=0.16):
    win = int(SR * 0.003)
    sm = np.convolve(np.abs(a), np.ones(win) / win, "same")
    above = sm > thr_frac * sm.max()
    rising = np.where(above[1:] & ~above[:-1])[0]
    out, last = [], -10 * SR
    for i in rising:
        if i - last > int(SR * min_gap):
            out.append(i)
            last = i
    return out


def main():
    src, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    a = load_mono(src)
    onsets = detect_onsets(a)

    pre, length = int(SR * 0.004), int(SR * 0.14)
    fi, fo = int(SR * 0.001), int(SR * 0.02)
    kept = 0
    peak_global = np.max(np.abs(a)) or 1.0
    for k, on in enumerate(onsets):
        s = max(0, on - pre)
        seg = a[s:s + length].copy()
        if len(seg) < length // 2:
            continue
        if np.max(np.abs(seg)) < 0.06 * peak_global:  # too quiet — probably a tail, skip
            continue
        # mellow it a touch: gentle low-pass + a softer/longer fade-out
        a_lp = np.exp(-2 * np.pi * 3800 / SR)
        prev = 0.0
        for j in range(len(seg)):
            prev = (1 - a_lp) * seg[j] + a_lp * prev
            seg[j] = prev
        fo = int(SR * 0.045)
        if len(seg) >= fi + fo:
            seg[:fi] *= np.linspace(0, 1, fi)
            seg[-fo:] *= np.linspace(1, 0, fo) ** 1.5
        seg = seg / (np.max(np.abs(seg)) or 1.0) * 0.95
        kept += 1
        with wave.open(os.path.join(out_dir, f"key{kept:02d}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((seg * 32767).astype(np.int16).tobytes())
    print(f"  extracted {kept} keystroke samples from {os.path.basename(src)} -> {out_dir}/")


if __name__ == "__main__":
    main()
