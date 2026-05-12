#!/usr/bin/env bash
# Adds a soft ambient pad soundtrack to the VHS-rendered demo.
# Input:  demo/superset-cli.mp4   (produced by `vhs demo/superset-cli.tape`)
# Output: demo/superset-cli-music.mp4
#
# The track is a synthesized two-chord pad (C major <-> A minor) with a slow
# 4-second swell — generated entirely with ffmpeg, no external assets. Swap in
# a real track by replacing the [1:a] input below.
set -euo pipefail
cd "$(dirname "$0")/.."          # -> packages/cli
SRC=demo/superset-cli.mp4
OUT=demo/superset-cli-music.mp4

[ -f "$SRC" ] || { echo "missing $SRC — run: vhs demo/superset-cli.tape" >&2; exit 1; }
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
FADE_AT=$(awk "BEGIN{print $DUR-3}")

# Per-4s Hann window (0 at chord boundaries -> no clicks), times three voices.
# First half of every 8s = C major (C3/E3/G3); second half = A minor (A3/C4/E4).
ENV='(0.5-0.5*cos(2*PI*mod(t,4)/4))'
V1='sin(2*PI*(if(lt(mod(t,8),4),130.81,220.00))*t)'
V2='sin(2*PI*(if(lt(mod(t,8),4),164.81,261.63))*t)'
V3='sin(2*PI*(if(lt(mod(t,8),4),196.00,329.63))*t)'
EXPR="${ENV}*0.30*(${V1}+${V2}+${V3})"

ffmpeg -y -i "$SRC" \
  -f lavfi -i "aevalsrc=exprs='${EXPR}':sample_rate=44100" \
  -filter_complex "[1:a]lowpass=f=750,volume=0.30,afade=t=in:st=0:d=2.5,afade=t=out:st=${FADE_AT}:d=3,atrim=0:${DUR}[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 160k -shortest "$OUT"

echo "wrote $OUT"
