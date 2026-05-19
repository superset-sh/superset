# Terminal WebGL Rendering

This note covers the terminal rendering fixes in this PR. These are renderer
fixes only; they do not change PTY lifetime, replay, serialized terminal
buffers, pane ownership, or terminal parking.

## Implemented Fixes

- Terminal WebGL addon setup is centralized in
  `apps/desktop/src/renderer/lib/terminal/terminal-webgl-addon.ts`, so both
  terminal creation paths use the same lifecycle.
- WebGL loading remains optional and delayed by one animation frame.
- If `WebglAddon` fails to load, later terminals in the same renderer process
  skip WebGL and use xterm's non-WebGL renderer.
- If WebGL reports context loss, the current terminal disposes its WebGL addon,
  refreshes visible rows immediately, refreshes again on the next animation
  frame, and marks future terminals in that renderer process for DOM fallback.
- If xterm's WebGL atlas reaches pressure, the code calls the public
  `WebglAddon.clearTextureAtlas()` API and refreshes visible rows. Detection is
  limited to xterm renderer state: `_charAtlas._requestClearModel === true` or
  an atlas page at least `2048px`.

## Why This Fix Is Local

Glyph corruption can happen while the copied terminal text and backend session
are still correct. That points at stale WebGL glyph atlas pixels rather than a
PTY stream or replay bug. Clearing the texture atlas forces xterm to rasterize
the visible glyphs again without rebuilding the terminal runtime or touching
the session.

## Related Upstream Issue

`xtermjs/xterm.js#5847`
(https://github.com/xtermjs/xterm.js/issues/5847) reports WebGL row ghosting
and glyph substitution under heavy true-color output.
