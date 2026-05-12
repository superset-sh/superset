#!/usr/bin/env bash
# Adds a soundtrack to the VHS-rendered demo: a lo-fi music bed (demo/music.mp3)
# plus mechanical-keyboard clicks timed off the .tape script.
#
#   Input:  demo/superset-cli.mp4   (produced by `vhs demo/superset-cli.tape`)
#           demo/music.mp3           (the music bed)
#           demo/keyboard.mp3        (a continuous mechanical-keyboard recording)
#   Output: demo/superset-cli-sound.mp4
#
# Credits: music — "Lofi Production" by Pulsebox (Pixabay, royalty-free);
#          keyboard — "Mechanical Keyboard Typing HD" by VirtualZero (Pixabay).
# Individual keystrokes are sliced out of keyboard.mp3 and dropped onto the
# .tape timeline (one random sample per key, with slight pitch/level jitter).
# If keyboard.mp3 is missing, the clicks fall back to a numpy synth.
set -euo pipefail
cd "$(dirname "$0")/.."          # -> packages/cli
SRC=demo/superset-cli.mp4
TAPE=demo/superset-cli.tape
MUSIC=${1:-demo/music.mp3}
KB=demo/keyboard.mp3
OUT=demo/superset-cli-sound.mp4
TMP=$(mktemp -d -t demo-sound)
CLICKS="$TMP/clicks.wav"

[ -f "$SRC" ]   || { echo "missing $SRC — run: vhs demo/superset-cli.tape" >&2; exit 1; }
[ -f "$MUSIC" ] || { echo "missing music bed: $MUSIC" >&2; exit 1; }
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
FADE_AT=$(awk "BEGIN{print $DUR-3}")

KEYS_ARG=""
if [ -f "$KB" ]; then
  echo "slicing keystroke samples from $KB ..."
  ffmpeg -y -loglevel error -i "$KB" -ac 1 -ar 44100 "$TMP/kb.wav"
  python3 demo/extract_keys.py "$TMP/kb.wav" "$TMP/keys"
  KEYS_ARG="$TMP/keys"
fi

echo "placing clicks on the timeline..."
python3 demo/gen_audio.py "$TAPE" "$CLICKS" "$DUR" "$KEYS_ARG"

# [music]  -> trim to video length, fade in/out, light low-pass, drop the level
# [clicks] -> as-is (already left headroom); mix, keep under the ceiling
ffmpeg -y -i "$SRC" -i "$MUSIC" -i "$CLICKS" \
  -filter_complex "\
    [1:a]atrim=0:${DUR},asetpts=PTS-STARTPTS,lowpass=f=12000,volume=0.5,afade=t=in:st=0:d=2,afade=t=out:st=${FADE_AT}:d=3[mus];\
    [2:a]volume=0.4[clk];\
    [mus][clk]amix=inputs=2:normalize=0,alimiter=limit=0.95:level=disabled,aresample=44100[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest "$OUT"
rm -rf "$TMP"
echo "wrote $OUT"
