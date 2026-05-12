#!/usr/bin/env bash
# Adds a soundtrack to the VHS-rendered demo: a lo-fi music bed (demo/music.mp3)
# plus keyboard clicks timed off the .tape script.
#
#   Input:  demo/superset-cli.mp4   (produced by `vhs demo/superset-cli.tape`)
#           demo/music.mp3           (the music bed)
#   Output: demo/superset-cli-sound.mp4
#
# Music bed: "Lofi Production" by Pulsebox (Pixabay, royalty-free).
# Keyboard clicks: synthesized by gen_audio.py — or drop demo/keypress.wav
# (and optionally demo/keyreturn.wav) to use a real recording instead.
set -euo pipefail
cd "$(dirname "$0")/.."          # -> packages/cli
SRC=demo/superset-cli.mp4
TAPE=demo/superset-cli.tape
MUSIC=${1:-demo/music.mp3}
OUT=demo/superset-cli-sound.mp4
CLICKS=$(mktemp -t demo-clicks).wav

[ -f "$SRC" ]   || { echo "missing $SRC — run: vhs demo/superset-cli.tape" >&2; exit 1; }
[ -f "$MUSIC" ] || { echo "missing music bed: $MUSIC" >&2; exit 1; }
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
FADE_AT=$(awk "BEGIN{print $DUR-3}")

echo "generating keyboard clicks..."
python3 demo/gen_audio.py "$TAPE" "$CLICKS" "$DUR" demo/keypress.wav demo/keyreturn.wav

# [music]  -> trim to video length, fade in/out, low-pass a touch, drop the level
# [clicks] -> as-is (already left headroom)
# mix the two, keep it under the ceiling
ffmpeg -y -i "$SRC" -i "$MUSIC" -i "$CLICKS" \
  -filter_complex "\
    [1:a]atrim=0:${DUR},asetpts=PTS-STARTPTS,lowpass=f=12000,volume=0.5,afade=t=in:st=0:d=2,afade=t=out:st=${FADE_AT}:d=3[mus];\
    [2:a]volume=0.85[clk];\
    [mus][clk]amix=inputs=2:normalize=0,alimiter=limit=0.95:level=disabled,aresample=44100[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest "$OUT"
rm -f "$CLICKS"
echo "wrote $OUT"
