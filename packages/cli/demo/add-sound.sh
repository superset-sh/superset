#!/usr/bin/env bash
# Adds a soundtrack to the VHS-rendered demo: a soft synthesized ambient pad
# plus keyboard clicks timed off the .tape script.
#
#   Input:  demo/superset-cli.mp4   (produced by `vhs demo/superset-cli.tape`)
#   Output: demo/superset-cli-sound.mp4
#
# Everything is generated with numpy/ffmpeg — no external audio assets.
set -euo pipefail
cd "$(dirname "$0")/.."          # -> packages/cli
SRC=demo/superset-cli.mp4
TAPE=demo/superset-cli.tape
OUT=demo/superset-cli-sound.mp4
WAV=$(mktemp -t demo-audio).wav

[ -f "$SRC" ] || { echo "missing $SRC — run: vhs demo/superset-cli.tape" >&2; exit 1; }
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")

echo "generating soundtrack..."
python3 demo/gen_audio.py "$TAPE" "$WAV" "$DUR"

ffmpeg -y -i "$SRC" -i "$WAV" \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest "$OUT"
rm -f "$WAV"
echo "wrote $OUT"
