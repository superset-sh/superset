#!/bin/bash
# Renders og-image.html to public/og-image.png (2400x1260) with headless Chrome.
# screenshot.png is a 1120x720 @2x capture of the desktop app (sidebar + workspace + changes panel).
# Needs network access once for the Inter web font.
set -euo pipefail
cd "$(dirname "$0")"

find_chrome() {
  if [ -n "${CHROME:-}" ]; then echo "$CHROME"; return; fi
  for bin in google-chrome google-chrome-stable chromium chromium-browser chrome; do
    if command -v "$bin" >/dev/null 2>&1; then command -v "$bin"; return; fi
  done
  for app in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
             "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
             "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
    if [ -x "$app" ]; then echo "$app"; return; fi
  done
  echo "No Chrome/Chromium found. Set CHROME=/path/to/chrome." >&2
  exit 1
}

CHROME_BIN="$(find_chrome)"
PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT

OUT="$PWD/../../public/og-image.png"
TMP_OUT="$PROFILE/og-image.png"
LOG="$PROFILE/chrome.log"

# Chrome writes the screenshot within a few seconds but its updater/crash-handler
# helpers can keep the process alive indefinitely, so wait for the file, then stop it.
"$CHROME_BIN" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
  --user-data-dir="$PROFILE" --window-size=1200,630 --force-device-scale-factor=2 --timeout=10000 \
  --screenshot="$TMP_OUT" "file://$PWD/og-image.html" >"$LOG" 2>&1 &
CHROME_PID=$!
for _ in $(seq 1 60); do
  [ -s "$TMP_OUT" ] && break
  kill -0 "$CHROME_PID" 2>/dev/null || break
  sleep 1
done
sleep 2
kill "$CHROME_PID" 2>/dev/null || true
wait "$CHROME_PID" 2>/dev/null || true

if [ ! -s "$TMP_OUT" ]; then
  cat "$LOG" >&2
  echo "render failed: no screenshot produced" >&2
  exit 1
fi
mv "$TMP_OUT" "$OUT"
echo "wrote public/og-image.png"
