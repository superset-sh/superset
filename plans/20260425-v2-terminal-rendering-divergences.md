# V2 Terminal Rendering Divergences vs VS Code / Hyper / Tabby

Compares our v2 xterm.js setup against three reference Electron+xterm terminals
and lists divergences that can plausibly cause rendering bugs (flicker, blurry
text, cell drift, ghost glyphs, scroll jumps, GPU atlas issues).

**Amended validation:** This document was reviewed against the current repo on
2026-04-25. The points below now distinguish confirmed issues from weaker
hypotheses and from items already handled by xterm internals.

**Our code (shared by v2 via `terminal-runtime-registry`):**
- `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts`
- `apps/desktop/src/renderer/lib/terminal/terminal-addons.ts`
- v2 pane: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx`

**References (verified locally):**
- VS Code: `/Users/kietho/workplace/vscode/src/vs/workbench/contrib/terminal/browser/xterm/xtermTerminal.ts`
- Tabby: `/Users/kietho/workplace/tabby/tabby-terminal/src/frontends/xtermFrontend.ts`
- Hyper: `/Users/kietho/workplace/hyper/lib/components/term.tsx`

---

## 1. Font loading race on first open

**Status:** Implemented after PR #3739.

**Us:** `terminal-runtime.ts:232` — `terminal.open(wrapper)` runs immediately
after construction. xterm measures cell width with whatever font is resolved at
that moment. If the final font loads after the first measurement, dimensions and
WebGL atlas contents can diverge from the actual rendered font, causing
mis-clipped chars, ghost glyphs, or first-paint reflow.

**Correction:** The original text overemphasized JetBrains Mono. In our default
stack, JetBrains Mono is a local/system font candidate, not an app-bundled
`@font-face`. The stronger async risk is `SF Mono` via
`apps/desktop/src/renderer/styles/bundled-fonts.css` (`font-display: swap`) and
any user-selected font that is resolved through CSS font loading. Also, Tabby
does not wait before `open()`; it opens first, waits a tick for font/layout
settling, then configures colors/WebGL (`xtermFrontend.ts:275-306`).

**Fix:** Implemented without making `createRuntime()` async. The runtime now
stores the active resize sender, exposes WebGL atlas clearing from
`terminal-addons.ts`, and schedules a bounded font-settle refit after attach,
after font changes, and after WebGL renderer changes:
- wait for `document.fonts.load(\`${size}px ${family}\`)` when available, capped
  by `FONT_SETTLE_TIMEOUT_MS`, then wait one animation frame for layout to
  settle;
- clear the WebGL texture atlas when present;
- run the existing `measureAndResize(runtime)` path, which preserves viewport
  state, refreshes the terminal, and sends backend resize only when cols/rows
  change.

---

## 2. `devicePixelRatio` / display-metrics monitoring

**Status:** Mostly invalid as originally written.

**Us:** Superset app code does not add its own DPR listener. However, xterm 6.1
already monitors DPR internally:
- `@xterm/xterm/src/browser/services/CoreBrowserService.ts` has
  `ScreenDprMonitor`, implemented with `matchMedia("screen and (resolution:
  ...dppx)")` and re-armed on every change.
- `RenderService.handleDevicePixelRatioChange()` remeasures char size and
  forwards DPR changes to the active renderer.
- `@xterm/addon-webgl/src/WebglRenderer.ts` updates `_devicePixelRatio`, resizes
  render dimensions, refreshes the atlas, and redraws.

**Ref:** Tabby additionally subscribes to `displayMetricsChanged$` and clears
both atlases:
```
xtermFrontend.ts:290  this.webGLAddon?.clearTextureAtlas()
xtermFrontend.ts:301  this.canvasAddon?.clearTextureAtlas()
```

**Fix:** Do not add an app-level DPR listener without a reproducible Electron
case showing xterm's built-in monitor is insufficient. If we later see stale
atlases after monitor moves or zoom changes, expose a `forceRedraw()`/atlas-clear
method from our addon loader and call it from the existing visibility/focus
recovery path, not from a duplicate global DPR watcher by default.

---

## 3. Subpixel container sizing in v2 pane

**Status:** Plausible, but overclaimed.

**Us:** `TerminalPane.tsx:382-396`
```
className="flex h-full w-full flex-col p-2"      ← outer p-2
  └ "relative min-h-0 flex-1 overflow-hidden"     ← flex-1 middle
      └ "h-full w-full"                            ← xterm mounts here
```

`connectionState === "closed"` adds a real sibling row at `TerminalPane.tsx:405`.
`TerminalSearch` is absolute positioned and does not participate in flex layout,
so it should not be counted as a sizing sibling. The outer `p-2` and flex sizing
can still leave the xterm parent with fractional CSS dimensions depending on the
split/pane layout. `fitAddon.fit()` floors cols/rows based on parsed parent
dimensions and xterm's WebGL canvas derives its own rounded CSS dimensions from
device pixels, so this remains a plausible source of 1-2px drift or blur.

**Ref:** VS Code does not pad the xterm container itself; Hyper applies padding via `term.element.style.padding` (`term.tsx:253,460`) so xterm sees and accounts for it.

**Fix:** Instrument before changing layout: log/compare the container
`contentRect`, `terminal.dimensions.css.canvas`, and actual canvas style size
across split widths and DPR values. If confirmed, either move padding off the
wrapper chain so xterm mounts in a stable integer-sized box, or apply padding via
`terminal.element.style.padding` after `open()` like Hyper so the fit addon
subtracts it intentionally.

---

## 4. ResizeObserver fires `fit()` undebounced

**Status:** Valid.

**Us:** `terminal-runtime.ts:284-285` — observer callback calls `measureAndResize` (which calls `fitAddon.fit()`) directly. Sidebar/pane animations fire 10+ times per second.

**Ref:**
- Tabby defers via `setImmediate` (`xtermFrontend.ts:508`).
- Hyper uses `setTimeout` debounce (`term.tsx:486`).
- VS Code uses `@debounce(100)` on refresh paths.

**Fix:** Wrap the observer callback in a ~50-100ms debounce, or rAF + trailing
edge. Skip when `entry.contentRect.width === 0 || height === 0`. Also only call
`onResize`/send backend resize when `terminal.cols` or `terminal.rows` actually
changed; the current callback always calls `onResize?.()` after `measureAndResize`.

---

## 5. No scroll-position preservation across resize

**Status:** Valid.

**Us:** `terminal-runtime.ts:207-212` `measureAndResize` calls `fit()` without saving viewport.

**Ref:** Tabby saves and restores around resize:
```
xtermFrontend.ts:427  const savedViewportY = this.xterm.buffer.active.viewportY
xtermFrontend.ts:432  // Restore scroll position — xterm internally disturbs viewportY
xtermFrontend.ts:437  if (this.xterm.buffer.active.viewportY !== targetY) ...
```

**Fix:** Mirror Tabby's pattern in `measureAndResize`, but preserve pinned-to-bottom
separately:
- before `fit()`, capture `viewportY`, `baseY`, and whether the viewport is at
  the bottom;
- after `fit()`, if it was pinned, `scrollToBottom()`;
- otherwise clamp the saved `viewportY` to the new `baseY` and `scrollToLine`.

---

## 6. Missing xterm options

**Status:** Partially valid, but not all options are rendering-bug fixes.

**Us:** `terminal-runtime.ts:106-108` sets `cursorBlink`, `fontFamily`, `fontSize`, theme, scrollback. Does **not** set `minimumContrastRatio`, `drawBoldTextInBrightColors`, or `allowTransparency`.

**Ref:** VS Code sets all three:
```
xtermTerminal.ts:226  drawBoldTextInBrightColors: config.drawBoldTextInBrightColors
xtermTerminal.ts:235  minimumContrastRatio: config.minimumContrastRatio
xtermTerminal.ts:261  allowTransparency: config.enableImages
```

**Correction:** `drawBoldTextInBrightColors` defaults to `true` in xterm 6.1, so
setting it explicitly is documentation more than behavior change. Built-in
terminal backgrounds are opaque hex colors (`ember`, `monokai`, `light`, and the
dark/light defaults), while only selection colors use alpha; therefore
`allowTransparency: false` is currently the correct performance-oriented value.
`minimumContrastRatio: 4.5` is valid for accessibility, but it changes colors
dynamically and should be treated as a product/color decision rather than a
rendering-fidelity fix.

**Fix:** Optionally set `drawBoldTextInBrightColors: true` and
`allowTransparency: false` explicitly to lock in intended behavior. Defer
`minimumContrastRatio` to a separate accessibility/theme decision.

---

## 7. No PTY backpressure on the renderer side

**Status:** Valid problem, incomplete proposed fix.

**Us:** Stream handler calls `terminal.write(data)` without the completion callback, so xterm's internal queue can grow unbounded under bursty output (e.g. `cat large.log`).

**Ref:** Tabby's `FlowControl` class blocks past N pending callbacks:
```
xtermFrontend.ts:25   class FlowControl {
xtermFrontend.ts:119  this.flowControl = new FlowControl(this.xterm)
```

**Correction:** Browser `WebSocket` cannot be paused like a Node stream. Host
service sends with `socket.send(JSON.stringify(message))` and does not currently
have a renderer ack/backpressure protocol. A renderer-side write queue can
prevent unbounded xterm writes, but it will not stop upstream buffering by itself.

**Fix:** Short term: wrap `terminal.write(data, callback)` in a renderer queue
with high/low watermarks so xterm is not flooded. Long term: add an explicit
pause/resume or credit/ack protocol between renderer and host service before
claiming end-to-end PTY backpressure.

---

## 8. WebGL/ligatures recreation on context loss

**Status:** Partially valid, but the original wording was inaccurate.

**Us:** `terminal-addons.ts:43` loads `LigaturesAddon` in try/catch. WebGL load
at `:46-56` already registers `webglAddon.onContextLoss`, disposes the WebGL
addon, nulls it, and refreshes. What is missing is an intentional reinitialization
strategy after falling back to DOM and any coordination between ligatures and
WebGL atlas recreation.

**Ref:** VS Code has `_refreshLigaturesAddon()` that disposes+recreates when WebGL toggles or recovers (xtermTerminal.ts, search `_refreshLigaturesAddon`).

**Fix:** Keep the existing context-loss disposal, but expose a recovery path:
dispose/recreate WebGL and refresh ligatures when GPU rendering is re-enabled or
on the next visibility/focus recovery. Lower priority because it only triggers on
real GPU resets.

---

## Suggested fix order

1. Resize handling (#4 + #5) — debounce observer callbacks, skip zero-size
   entries, send backend resize only on cols/rows changes, and preserve
   scroll/pinned-to-bottom state across `fit()`.
2. Font settle/refit (#1) — add a bounded post-open and post-font-change font
   readiness/refit path without making the registry lifecycle accidentally async.
3. Subpixel padding investigation (#3) — instrument actual container/canvas sizes
   first; only then move padding or apply it via `terminal.element.style.padding`.
4. xterm option explicitness (#6) — explicitly set defaults we rely on
   (`drawBoldTextInBrightColors: true`, `allowTransparency: false`) if desired;
   treat `minimumContrastRatio` as a separate theme/accessibility decision.
5. Renderer write queue / protocol backpressure (#7) — useful for heavy output,
   but needs a renderer queue first and host-service protocol work for true
   backpressure.
6. WebGL/ligature recovery (#8) — separate low-priority follow-up.

Do not prioritize an app-level DPR listener (#2) unless there is a concrete repro
showing xterm 6.1's built-in DPR monitor fails in our Electron window.
