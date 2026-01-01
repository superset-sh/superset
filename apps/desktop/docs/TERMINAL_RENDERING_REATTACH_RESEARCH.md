# Terminal Rendering + Reattach Research Log (Scratchpad)

This doc is a living scratchpad for understanding and fixing two related UX problems in Superset Desktop terminals:

1. **TUI corruption after switching away and back** (e.g. OpenCode/vim-like apps).
2. **Jittery resizing** (especially noticeable on macOS with Canvas rendering).

It’s written for engineers who **do not have the original investigation context**.

---

## TL;DR

- **Corruption on tab switch** is usually not “random rendering”; it’s a *reattach correctness* problem: TUIs emit **incremental** escape sequences that assume a precise current screen/mode/cursor state. If we detach/unmount the renderer and later rebuild it from a snapshot, any tiny mismatch becomes visible as corruption when the TUI continues sending incremental updates.
- **Resize jitter** is mostly a throughput problem: resizing causes frequent PTY resizes + full-screen repaints from TUIs, and xterm.js processes input in **time-sliced batches** to avoid blocking the UI thread. Under heavy output, it can’t stay at 60fps without aggressive resize coalescing and/or a GPU-first renderer.

---

## Current Architecture (as implemented in this repo)

High-level data flow:

```
Renderer (xterm.js in React)
  ↕ TRPC stream/write calls
Electron main
  ↕ Unix socket IPC
terminal-host daemon (Node.js)
  ↕ stdin/stdout IPC
per-session PTY subprocess (Node.js + node-pty)
  ↕ PTY
shell / TUI (opencode, vim, etc.)
```

Key concepts:

- **Daemon owns sessions** so terminals persist across app restarts.
- **Headless emulator** in daemon maintains a model of the terminal state (screen + modes) and produces a snapshot for reattach.
- **Renderer is recreated** on React mount; on “switch away” we may detach/unmount and later reattach to the daemon session.

Related docs/code:
- Large paste reliability notes: `LARGE_PASTE_HANG_ANALYSIS.md` (repo root).
- Headless emulator: `apps/desktop/src/main/lib/terminal-host/headless-emulator.ts`.
- Renderer creation / GPU renderer selection: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/helpers.ts`.

Related problem area:
- **Large paste reliability** was previously a major source of hangs/dropped input. The current direction is per-PTY subprocess isolation + explicit backpressure handling (treating `EAGAIN` as retry/backoff instead of “drop”). See `LARGE_PASTE_HANG_ANALYSIS.md` for details.

---

## Symptom 1: TUI corruption after switching away and back

### What we observe

- Happens when switching away from a terminal and then returning to it.
- Not necessarily tied to full app restart.
- Affects TUIs that are screen-oriented and repaint frequently (OpenCode is a common reproduction).

### Why this is hard (fundamental)

Most TUIs do **incremental drawing**:
- move cursor
- rewrite a few cells
- update a small region
- assume a specific active buffer (normal vs alternate screen)
- assume a specific mode state (cursor keys, mouse tracking, bracketed paste, etc.)

If we “reattach” by creating a new xterm renderer and restoring the screen from a snapshot, then:
- if the snapshot is taken **mid-update** (or we rehydrate in the wrong order),
- or if any output is missed/duplicated around the detach boundary,
- or if modes differ slightly between headless model and the new renderer,

…the next incremental updates from the TUI apply relative to the wrong baseline and appear as corruption.

This is not unique to Superset: xterm.js itself historically describes the only reliable way to “set” terminal state via public API as **replaying the commands that produced it**, and points toward headless/serialization as a reconnection primitive.

### Key point: persistence vs rendering

- **Persistence feature** increases exposure because it introduces **detach/attach** as a common lifecycle event.
- The corruption itself is typically a combination of:
  - **reattach semantics** (state mismatch), and sometimes
  - **renderer quirks** (WebGL issues on macOS, hidden/visible transitions).

If you never detach/unmount the renderer on tab switch, you remove the most failure-prone step.

---

## Symptom 2: Resize feels jittery

### What we observe

- Resizing panes feels less “buttery” than modern terminals like Warp.
- Jitter is especially noticeable with TUI output in flight and when using CPU rendering (Canvas).

### Why this happens (fundamental)

Resizing is expensive in a terminal for two reasons:

1) **Logical resize triggers PTY resize → TUIs repaint**
- When cols/rows change, the PTY receives a resize (SIGWINCH on Unix-like systems).
- TUIs often repaint large regions or the entire screen in response.
- That yields a burst of output (escape-sequence heavy) right while we are doing layout work.

2) **xterm.js has limited throughput and is intentionally time-sliced**
- `term.write()` is non-blocking; xterm buffers data and processes it in chunks designed to stay under ~one frame budget (≈16ms) to avoid blocking the UI thread.
- When producers are “too fast”, the terminal gets sluggish and may stop responding to input; hence flow control/backpressure is required in high-throughput pipelines.

So “resize jitter” often means: **we’re asking xterm to keep up with heavy output + frequent resizes** faster than it can process/render.

### Why Warp feels smooth

Warp’s architecture is built around a GPU-first renderer (Metal on macOS) and careful minimization of bottlenecks (PTY read/parse, render, scroll).

That doesn’t automatically mean “WebGL fixes it” inside xterm.js; in practice `xterm-webgl` has had regressions and rendering issues, and on macOS we’ve repeatedly seen corruption when hiding/showing terminals or switching panes.

---

## Renderer notes (macOS)

### WebGL vs Canvas vs DOM

- **WebGL**: best performance potential, but can be fragile (glyph atlas / context loss / hidden-canvas transitions).
- **Canvas**: more stable but more CPU-bound (often leads to jitter under load).
- **DOM**: typically slowest, mostly a fallback.

xterm.js’ core rendering and addons list includes WebGL and Serialize, but they come with tradeoffs.

Current repo approach (as of recent fixes):
- Default to **Canvas on macOS** to avoid WebGL corruption on tab switching.
- Allow overriding for testing via localStorage:
  - `localStorage.setItem('terminal-renderer', 'webgl' | 'canvas' | 'dom')`
  - `localStorage.removeItem('terminal-renderer')` to revert to default.

---

## Why switching away/back is specifically triggering corruption

When a terminal is unmounted/hidden and later recreated:

- A **new xterm instance** is created.
- We restore from daemon snapshot (serialize output + “rehydrate sequences”).
- The TUI process never stopped; it keeps emitting updates based on its own internal model.

The critical window is the detach/attach boundary:

- If the daemon snapshot isn’t taken at a stable boundary (e.g. “frame complete”),
- or if output continues while we are capturing/restoring and we apply it in a different order,
- or if we rehydrate modes (alternate screen, cursor modes, mouse tracking, bracketed paste) in the wrong sequence,

…the restored xterm state can be “close enough” for plain shells but not for screen-oriented TUIs.

This aligns with how terminal state restoration is generally discussed in the ecosystem: the most robust systems keep an authoritative server-side screen model and redraw it to clients on attach (tmux-style).

---

## Design Options (out-of-the-box)

These are “shape of the system” ideas, not small bug fixes.

### Option A — Don’t detach on tab switch (keep renderer alive)

Make tab switching purely a show/hide operation:
- keep the xterm instance alive in memory (and ideally attached to the session)
- avoid rehydrate/snapshot on routine navigation

Pros:
- Removes the core “reattach baseline mismatch” failure mode.
- Likely the fastest path to eliminating OpenCode corruption on switch-back.

Cons:
- More memory/CPU if many terminals are open.
- Might need policies (e.g. keep last N terminals “hot”; hibernate older ones).

### Option B — tmux-style server authoritative screen diff

Make the daemon the “truth” for terminal UI:
- daemon maintains the full screen grid and cursor/mode state
- on attach: send full state (grid + modes)
- during run: send diffs/updates to clients

Pros:
- Reattach becomes robust (clients can come/go without state mismatch).
- Matches how tmux achieves persistence.

Cons:
- Significant engineering effort: you’re effectively building a multiplexer protocol.
- Must ensure your screen model matches what the client renders (font metrics, wrapping, etc.).

### Option C — Use tmux/screen as the persistence layer

Put tmux behind the scenes:
- daemon starts tmux, each terminal is a tmux pane
- renderer is a normal terminal client

Pros:
- tmux already solved “detach/reattach with a stable screen model”.
- Avoids inventing a custom diff protocol.

Cons:
- External dependency and platform concerns.
- Integrating with our UX/workspace model could be awkward.

### Option D — Per-terminal WebContents / BrowserView “view host”

Instead of recreating terminals in React, host each terminal view in a persistent Electron view:
- switch visibility at the compositor level

Pros:
- Avoid rehydrate for navigation.
- Strong isolation between terminal views.

Cons:
- More complex Electron lifecycle; resource usage can rise.

### Option E — Own the renderer (Warp/WezTerm direction)

Long-term: a native/GPU-first terminal renderer and more control over resizing.

Pros:
- Best chance at “buttery” resize + fewer corruption classes.
- Warp shows the ceiling when you own the rendering pipeline.

Cons:
- Very large scope; essentially building a terminal engine inside the app.

---

## Practical experiment ideas (near-term)

These are experiments that can confirm root causes quickly:

1) **Keep renderer alive on tab switch** (no detach/reattach) and see if OpenCode corruption disappears.
2) **Coalesce resizes**:
   - “visual resize” during drag (scale), only “logical resize” (PTY cols/rows) on settle.
   - lower-frequency resize dispatch (debounce/throttle) to reduce repaint storms.
3) **Force TUI redraw on attach**:
   - e.g. synthetic resize nudge or sending a reset sequence (careful: many resets have side effects).
   - This is a mitigation, not a root fix.
4) **Instrument attach boundary**:
   - capture sequence numbers: last byte processed in emulator vs first byte delivered to client after attach
   - detect and log gaps/duplication
   - confirm mode parity (alternate screen, bracketed paste, mouse modes)

---

## Reference links

- xterm.js flow control guide (buffering, time-sliced processing, throughput limits): https://xtermjs.org/docs/guides/flowcontrol/
- xterm.js issue: “Support saving and restoring of terminal state” (headless + “replay commands” framing): https://github.com/xtermjs/xterm.js/issues/595
- xterm.js supported terminal sequences (what is/ isn’t supported): https://xtermjs.org/docs/api/vtfeatures/
- xterm.js WebGL regression example: https://github.com/xtermjs/xterm.js/issues/4665
- tmux client/server architecture overview (high level): https://www.augmentcode.com/open-source/tmux/tmux
- Warp “How Warp Works” (GPU-first and performance bottlenecks): https://www.warp.dev/blog/how-warp-works
