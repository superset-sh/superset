# Terminal Persistence — Technical Notes

> **Date**: January 2026  
> **Feature**: Terminal session persistence via daemon process  
> **PR**: #541

This document captures the technical decisions, debugging investigations, and solutions for the terminal persistence feature. It's intended for engineers who need to understand **why** certain approaches were chosen.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [TUI Restoration: Why SIGWINCH Instead of Snapshots](#tui-restoration-why-sigwinch-instead-of-snapshots)
3. [Large Paste Reliability: Subprocess Isolation + Backpressure](#large-paste-reliability-subprocess-isolation--backpressure)
4. [Renderer Notes: WebGL vs Canvas on macOS](#renderer-notes-webgl-vs-canvas-on-macos)
5. [Design Options Considered](#design-options-considered)
6. [Reference Links](#reference-links)

---

## Architecture Overview

High-level data flow:

```
Renderer (xterm.js in React)
  ↕ TRPC stream/write calls
Electron main
  ↕ Unix socket IPC
terminal-host daemon (Node.js)
  ↕ stdin/stdout IPC (binary framing)
per-session PTY subprocess (Node.js + node-pty)
  ↕ PTY
shell / TUI (opencode, vim, etc.)
```

Key concepts:

- **Daemon owns sessions** so terminals persist across app restarts.
- **Headless emulator** in daemon maintains a model of the terminal state (screen + modes) and produces a snapshot for reattach.
- **Per-session subprocess** isolates each PTY so one terminal can't freeze others.
- **Renderer is recreated** on React mount; on "switch away" we detach and later reattach to the daemon session.

---

## TUI Restoration: Why SIGWINCH Instead of Snapshots

### The Problem

When switching away from a terminal running a TUI (like opencode, vim, claude) and switching back, we saw visual corruption—missing ASCII art, input boxes, and UI elements.

### Why Snapshots Don't Work for TUIs

1. TUIs use "styled spaces" (spaces with background colors) to create UI elements
2. `SerializeAddon` captures buffer cell content, but serialization of styled empty cells is inconsistent
3. When restored, the serialized snapshot renders sparsely—missing panels, borders, and UI chrome

**Diagnostic data showed the problem:**
```
ALT-BUFFER: lines=52 nonEmpty=14 chars=2156
```
A full TUI screen (91×52 = 4732 cells) should have far more content. The alt buffer was sparse.

### Investigation Timeline

| # | Hypothesis | Test | Result |
|---|------------|------|--------|
| 1 | Live events interleaving with snapshot | Added logging for pending events | ❌ PENDING_EVENTS=0 |
| 2 | Double alt-screen entry | Disabled manual entry | ❌ Still corrupted |
| 3 | WebGL renderer issues | Forced Canvas renderer | ❌ Still corrupted |
| 4 | Dimension mismatch | Logged xterm vs snapshot dims | ❌ MATCH=true |
| 5 | Alt-screen buffer mismatch | Logged transition sequences | ❌ CONSISTENT=true |

### Root Cause: Flush Timeout During Snapshot

**Location:** `Session.attach()` in `apps/desktop/src/main/terminal-host/session.ts`

With continuous TUI output (like OpenCode), the emulator write queue NEVER empties in the timeout window. `Promise.race()` times out, but queued data never made it to xterm before snapshot capture.

### The Solution: Skip Snapshot, Trigger SIGWINCH

Instead of trying to perfectly serialize and restore TUI state:

1. **Skip writing the broken snapshot** for alt-screen (TUI) sessions
2. **Enter alt-screen mode** directly so TUI output goes to the correct buffer
3. **Enable streaming first** so live PTY output comes through
4. **Trigger SIGWINCH** via resize down/up—TUI redraws itself from scratch

```typescript
if (isAltScreenReattach) {
  xterm.write("\x1b[?1049h");  // Enter alt-screen
  isStreamReadyRef.current = true;
  flushPendingEvents();
  
  // Trigger SIGWINCH via resize
  resizeRef.current({ paneId, cols, rows: rows - 1 });
  setTimeout(() => {
    resizeRef.current({ paneId, cols, rows });
  }, 100);
}
```

### Trade-offs

| Aspect | Snapshot Approach | SIGWINCH Approach |
|--------|-------------------|-------------------|
| Visual continuity | Broken (sparse/corrupted) | Brief flash as TUI redraws |
| Correctness | Unreliable | Reliable (TUI owns its state) |
| Complexity | High | Low |

**Non-TUI sessions** (normal shells) still use the snapshot approach, which works correctly for scrollback history and shell prompts.

---

## Large Paste Reliability: Subprocess Isolation + Backpressure

### The Problem

Pasting large blocks of text (e.g. 3k+ lines) into `vi` could:
- Hang the terminal daemon / freeze all terminals, or
- Partially paste and then silently stop (missing chunks)

Most visible on macOS (small kernel PTY buffer + very high output volume during `vi` repaints).

### Two Distinct Failure Modes

**1) CPU saturation on output (daemon side)**

Large pastes cause `vi` to repaint aggressively, producing huge volumes of escape-sequence-heavy output. If the daemon tries to parse that output in large unbounded chunks, it monopolizes the event loop.

**2) Backpressure on input (PTY write side)**

PTY writes must respect backpressure. When writing to a PTY fd in non-blocking mode, the kernel can return `EAGAIN`/`EWOULDBLOCK`. If treated as fatal, paste chunks get dropped.

### The Solution

**Process isolation (per terminal)**

Each PTY runs in its own subprocess (`pty-subprocess.ts`). One terminal hitting backpressure can't freeze the daemon or other terminals.

**Binary framing (no JSON on hot paths)**

Subprocess ↔ daemon communication uses length-prefixed binary framing (`pty-subprocess-ipc.ts`) to avoid JSON overhead on escape-heavy output.

**Output batching + stdout backpressure**

Subprocess batches PTY output (32ms cadence, 128KB max) and pauses PTY reads when `process.stdout` is backpressured.

**Input backpressure (retry, don't drop)**

Subprocess treats `EAGAIN`/`EWOULDBLOCK` as expected backpressure:
- Keeps queued buffers
- Retries with exponential backoff (2ms → 50ms)
- Pauses upstream when backlog exceeds high watermark

**Daemon responsiveness (time-sliced emulator)**

The daemon applies PTY output to the headless emulator in time-budgeted slices.

### Debugging

Set these env vars and restart the app:
- `SUPERSET_PTY_SUBPROCESS_DEBUG=1` — subprocess batching + PTY input backpressure logs
- `SUPERSET_TERMINAL_EMULATOR_DEBUG=1` — daemon emulator budget/overrun logs

```bash
ps aux | rg "terminal-host|pty-subprocess"
```

---

## Renderer Notes: WebGL vs Canvas on macOS

### The Problem

Severe corruption/glitching when switching between terminals on macOS with `xterm-webgl`.

### Current Approach

- **Default to Canvas on macOS** for stability
- **WebGL on other platforms** for performance
- Allow override for testing via localStorage:
  ```javascript
  localStorage.setItem('terminal-renderer', 'webgl' | 'canvas' | 'dom')
  localStorage.removeItem('terminal-renderer')  // revert to default
  ```

### Why Warp Feels Smoother

Warp's architecture is GPU-first (Metal on macOS) with careful minimization of bottlenecks. That doesn't automatically mean "WebGL fixes it" inside xterm.js—in practice `xterm-webgl` has had regressions on macOS.

---

## Design Options Considered

These were evaluated during the design phase:

### Option A — Don't detach on tab switch (keep renderer alive)

Make tab switching purely a show/hide operation. Removes the core "reattach baseline mismatch" failure mode.

**Pros:** Fastest path to eliminating corruption  
**Cons:** More memory if many terminals open; needs hibernation policies

### Option B — tmux-style server authoritative screen diff

Daemon maintains full screen grid; sends diffs to clients.

**Pros:** Robust reattach  
**Cons:** Significant engineering effort; essentially building a multiplexer

### Option C — Use tmux/screen as persistence layer

Put tmux behind the scenes.

**Pros:** tmux already solved this  
**Cons:** External dependency; platform concerns

### Option D — Per-terminal WebContents/BrowserView

Host each terminal in a persistent Electron view.

**Pros:** Avoid rehydrate for navigation  
**Cons:** Complex Electron lifecycle

### What We Chose

For v1, we implemented a daemon with SIGWINCH-based TUI restoration. This balances correctness (TUI redraws itself) with implementation complexity.

---

## Reference Links

- [xterm.js flow control guide](https://xtermjs.org/docs/guides/flowcontrol/) — buffering, time-sliced processing
- [xterm.js issue #595](https://github.com/xtermjs/xterm.js/issues/595) — "Support saving and restoring of terminal state"
- [xterm.js VT features](https://xtermjs.org/docs/api/vtfeatures/) — supported sequences
- [xterm.js WebGL issues](https://github.com/xtermjs/xterm.js/issues/4665) — regression examples
- [How Warp Works](https://www.warp.dev/blog/how-warp-works) — GPU-first architecture
