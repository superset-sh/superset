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

## Investigation Log (January 2026)

### Observed Corruption

When switching workspaces with OpenCode running, the restored terminal shows **missing content**:
- The "opencode" ASCII art logo is completely missing
- The "Ask anything..." input box is missing
- Only partial UI elements remain (agent name, status bar)
- Cursor position is wrong (middle of screen instead of input area)

This is NOT garbled characters or wrong colors—it's **missing screen regions**, suggesting the snapshot content is incomplete or truncated.

### Hypotheses Tested and Ruled Out

| # | Hypothesis | Test | Result |
|---|------------|------|--------|
| 1 | **Live events interleaving with snapshot** - Events arrive before snapshot is applied | Added logging: `PENDING_EVENTS` count at snapshot time | ❌ PENDING_EVENTS=0 in all cases |
| 2 | **Double alt-screen entry** - Manual `\x1b[?1049h` + scrollback's copy | Disabled manual entry, logged if scrollback contains it | ❌ Still corrupted with manual entry disabled |
| 3 | **WebGL renderer issues** - Glyph atlas corruption | Forced Canvas renderer via localStorage | ❌ Still corrupted with Canvas |
| 4 | **Dimension mismatch** - Snapshot written at wrong cols/rows | Logged xterm vs snapshot dimensions | ❌ MATCH=true (106x60 = 106x60) |
| 5 | **Alt-screen buffer mismatch** - modes.altScreen disagrees with scrollback's last transition | Logged lastIndexOf for enter/exit sequences | ❌ CONSISTENT=true |

### Key Observations from Logs

```
APPLYING SNAPSHOT: scrollback=8247 rehydrate=48 altScreen=true PENDING_EVENTS=0
ALT-SCREEN CHECK: modes.altScreen=true scrollbackHasAlt=true
ALT-SCREEN TRANSITION: lastEnterIdx=275 lastExitIdx=-1 lastTransition=ENTER CONSISTENT=true
DIMENSION CHECK: xterm=106x60 snapshot=106x60 MATCH=true
```

- Dimensions match perfectly
- Alt-screen mode is consistent between daemon and scrollback
- No pending events at snapshot time
- rehydrateSequences is only 48 bytes (may be too small for full TUI state?)

### Remaining Hypotheses (Not Yet Tested)

1. **Flush timeout during snapshot** - Daemon's `flushEmulatorWrites()` times out under heavy output, capturing incomplete screen state

2. **Snapshot content is incomplete/stale** - The headless emulator isn't capturing the full screen buffer correctly for alternate screen TUIs

3. **Missing TUI state in rehydrateSequences** - 48 bytes may not cover all modes TUIs need (scroll region, saved cursor, character sets, etc.)

4. **Cursor position not in snapshot** - TUI assumes cursor is in input area, but we're not restoring cursor position

### Next Steps

1. **Investigate daemon-side snapshot generation** (`headless-emulator.ts`)
   - Is the alternate screen buffer being serialized correctly?
   - Is cursor position included in the snapshot?
   - Does flush timeout occur during capture?

2. **Log actual snapshot content** - Inspect first/last bytes to see if content is truncated

3. **Compare headless emulator state vs actual screen** - Hash comparison to detect discrepancies

### Code Changes Made During Investigation

Added diagnostic logging to `Terminal.tsx`:
- `APPLYING SNAPSHOT` - scrollback size, rehydrate size, alt screen mode, pending events
- `ALT-SCREEN CHECK` - whether scrollback/rehydrate contain alt-screen sequences
- `ALT-SCREEN TRANSITION` - which transition (enter/exit) came last, consistency check
- `DIMENSION CHECK` - xterm cols/rows vs snapshot cols/rows
- `QUEUING/FLUSHING` - event timing during reattach

These logs can be removed once the root cause is found.

---

## ROOT CAUSE IDENTIFIED & FIX IMPLEMENTED (January 2026)

### The Bug: Flush Timeout During Snapshot

**Location:** `Session.attach()` in `apps/desktop/src/main/terminal-host/session.ts`

**The Problem Flow:**

```
1. User switches tabs, triggering attach()
2. attach() calls flushEmulatorWrites(500ms) to process pending PTY output
3. With continuous TUI output (like OpenCode), the queue NEVER empties in 500ms
4. Promise.race() times out, but emulatorWriteQueue still has unprocessed data
5. attach() immediately calls getSnapshotAsync()
6. Snapshot captures INCOMPLETE state - queued data never made it to xterm!
```

**The Data Flow:**
```
PTY → Session.emulatorWriteQueue → HeadlessEmulator.terminal (xterm) → snapshot
                    ↑
            STUCK HERE if timeout
```

**Why Previous Tests Missed This:**
- Renderer-side logs showed `PENDING_EVENTS=0` - but that's the RENDERER's queue
- The DAEMON's `emulatorWriteQueue` was the culprit
- The bug is invisible from the renderer's perspective

### The Fix: Snapshot Boundary Tracking

Instead of waiting for the entire queue to empty (impossible with continuous output), we now:

1. **Mark a "snapshot boundary"** when attach() is called (current queue length)
2. **Decrement the counter** as items are processed
3. **Resolve when boundary reached** (processed all pre-attach data)
4. **Ignore post-attach data** for snapshot purposes (it will be streamed live)

**Key Changes:**

```typescript
// session.ts - New state tracking
private snapshotBoundaryIndex: number | null = null;
private snapshotBoundaryWaiters: Array<() => void> = [];

// New method: flushToSnapshotBoundary(timeoutMs)
// - Sets boundary = queue.length at call time
// - Waits for that many items to be processed
// - Guarantees consistent point-in-time snapshot

// attach() now uses:
const reachedBoundary = await this.flushToSnapshotBoundary(ATTACH_FLUSH_TIMEOUT_MS);
// Instead of:
await this.flushEmulatorWrites(ATTACH_FLUSH_TIMEOUT_MS);  // OLD - broken
```

### Why This Fix Works

- With continuous output, new data keeps arriving AFTER attach() is called
- We only care about data received BEFORE attach - that's what defines our snapshot point
- By counting items instead of waiting for empty, we get a consistent snapshot
- Post-attach data streams live to the renderer (normal operation)

### Logging Added for Verification

**Daemon-side (`session.ts`):**
```
[Session X] ATTACH FLUSH OK: flushTime=123ms processed=42 items (8192 bytes)
[Session X] ATTACH FLUSH TIMEOUT: flushTime=500ms queueBefore=100 queueAfter=75
```

**Headless emulator (`headless-emulator.ts`):**
```
[HeadlessEmulator] SNAPSHOT: altScreen=true snapshotSize=12345 rehydrateSize=48 cols=106 rows=60
```

### Testing Needed

1. Run OpenCode in a terminal
2. Switch to a different workspace tab
3. Switch back
4. Verify: ASCII art logo and input box should now be visible
5. Check logs for "ATTACH FLUSH OK" instead of "ATTACH FLUSH TIMEOUT"

---

## FINAL FIX: SIGWINCH-Based TUI Redraw (January 2026)

### Why Snapshots Don't Work for TUIs

After implementing the snapshot boundary fix above, we discovered a **deeper issue**: even with correct snapshots, TUI rendering was still broken.

**The Problem:**

1. TUIs use "styled spaces" (spaces with background colors) to create UI elements
2. SerializeAddon captures buffer cell content, but serialization of styled empty cells is inconsistent
3. When restored, the serialized snapshot renders sparsely—missing panels, borders, and UI chrome

**Diagnostic Data:**
```
ALT-BUFFER: lines=52 nonEmpty=14 chars=2156
```
A full TUI screen (91×52 = 4732 cells) should have far more content. The alt buffer was sparse.

### The Solution: Skip Snapshot, Trigger SIGWINCH

Instead of trying to perfectly serialize and restore TUI state, we now:

1. **Skip writing the broken snapshot** for alt-screen (TUI) sessions
2. **Enter alt-screen mode** directly so TUI output goes to the correct buffer
3. **Enable streaming first** so live PTY output comes through
4. **Trigger SIGWINCH** via resize down/up—TUI redraws itself from scratch

**Key Code (Terminal.tsx):**
```typescript
if (isAltScreenReattach) {
  // Enter alt-screen mode
  xterm.write("\x1b[?1049h");
  
  // Apply non-alt-screen rehydration sequences
  if (result.snapshot?.rehydrateSequences) { ... }
  
  // Enable streaming BEFORE resize
  isStreamReadyRef.current = true;
  flushPendingEvents();
  
  // Trigger SIGWINCH
  resizeRef.current({ paneId, cols, rows: rows - 1 });
  setTimeout(() => {
    resizeRef.current({ paneId, cols, rows });
  }, 100);
  
  return; // Skip normal snapshot flow
}
```

### Trade-offs

| Aspect | Before (Snapshot) | After (SIGWINCH) |
|--------|-------------------|------------------|
| Visual continuity | Broken (sparse/corrupted) | Brief flash as TUI redraws |
| Correctness | Unreliable | Reliable (TUI owns its state) |
| Complexity | High (serialize/deserialize TUI state) | Low (let TUI handle it) |
| Performance | Single write of serialized data | TUI full repaint via stream |

### Why This Works

- TUIs maintain their own internal state and can redraw on SIGWINCH
- We're not trying to perfectly capture a moving target (incremental TUI updates)
- The TUI is the authority on its own display—we just trigger a refresh

### Non-TUI Sessions Unchanged

Normal shell sessions (not in alternate screen mode) still use the snapshot approach, which works correctly for scrollback history and shell prompts.

---

## Reference links

- xterm.js flow control guide (buffering, time-sliced processing, throughput limits): https://xtermjs.org/docs/guides/flowcontrol/
- xterm.js issue: “Support saving and restoring of terminal state” (headless + “replay commands” framing): https://github.com/xtermjs/xterm.js/issues/595
- xterm.js supported terminal sequences (what is/ isn’t supported): https://xtermjs.org/docs/api/vtfeatures/
- xterm.js WebGL regression example: https://github.com/xtermjs/xterm.js/issues/4665
- tmux client/server architecture overview (high level): https://www.augmentcode.com/open-source/tmux/tmux
- Warp “How Warp Works” (GPU-first and performance bottlenecks): https://www.warp.dev/blog/how-warp-works
