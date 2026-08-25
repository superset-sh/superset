#!/usr/bin/env bash
# Repro for kitty Unicode placeholders (U=1) — see
# plans/20260825-kitty-unicode-placeholder-images.md
#
# Emits the exact byte sequence ratatui-image sends when it detects a
# kitty-class terminal: transmit the image as a *virtual* placement (U=1),
# then position it with U+10EEEE placeholder cells whose diacritics encode
# row/column and whose foreground color encodes the image id.
#
#   Ghostty / kitty        -> a checkerboard image appears.
#   Superset terminal      -> no image; the placeholder rows render as
#                             literal combining-diacritic garbage.
#
# The image is a tiny 64x64 PNG inlined as base64, so this script is
# self-contained and needs no Rust toolchain and no network.
set -u

IMAGE_ID=31
PNG_B64="iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAlklEQVR4nO3PsRHAQBDCwO+/absCAiIdMyImWL0X9oWt/M+BDKBBBtAgA2hQ/M9AV0AG0CADaJABNKgOWIHWYddABtAgA2iQATQo/megKyADaJABNMgAGlQHrEDrsGsgA2iQATTIABoU/zPQFZABNMgAGmQADaoDVqB12DWQATTIABpkAA2K/xnoCsgAGmQADTKABrX/H/1C6Vq1O0GZAAAAAElFTkSuQmCC"

# a=T transmit+display, U=1 virtual placement, f=100 PNG, t=d direct payload.
# Nothing is drawn by this alone: a virtual placement only becomes visible
# where placeholder cells reference it.
printf '\033_Gq=2,i=%s,a=T,U=1,f=100,t=d,m=0;%s\033\\' "$IMAGE_ID" "$PNG_B64"

# The placement itself. This is ordinary text, not a control sequence, which
# is why a terminal without U=1 support paints it as glyphs.
python3 - "$IMAGE_ID" <<'PY'
import sys

image_id = int(sys.argv[1])
# Kitty's row/column diacritics; index N encodes row/column N.
DIACRITICS = ['\u0305', '\u030D', '\u030E']
ROWS, COLS = 3, 6

# The image id travels in the foreground color (high byte is a 4th diacritic,
# unused here since the id is small).
_extra, r, g, b = image_id.to_bytes(4, 'big')

lines = []
for row in range(ROWS):
    # First cell carries row + column diacritics; the rest inherit them.
    line = f'\x1b[38;2;{r};{g};{b}m'
    line += '\U0010EEEE' + DIACRITICS[row] + DIACRITICS[0]
    line += '\U0010EEEE' * (COLS - 1)
    lines.append(line + '\x1b[0m')

sys.stdout.write('\n'.join(lines) + '\n')
PY

echo "^ Expect a checkerboard image above."
echo "  Garbage glyphs instead => this terminal ignores kitty U=1 placements."
