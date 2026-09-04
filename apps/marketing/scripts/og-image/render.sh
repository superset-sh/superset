#!/bin/bash
# Renders og-image.html to public/og-image.png (2400x1260) with headless Chrome.
# screenshot.png is a 1120x720 @2x capture of the desktop app (sidebar + workspace + changes panel).
set -euo pipefail
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PROFILE="$(mktemp -d)"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
  --user-data-dir="$PROFILE" --window-size=1200,630 --force-device-scale-factor=2 --timeout=8000 \
  --screenshot="$PWD/../../public/og-image.png" "file://$PWD/og-image.html" >/dev/null 2>&1
rm -rf "$PROFILE"
echo "wrote public/og-image.png"
