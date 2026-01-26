# Terminal Reattach Scroll Jump - Root Cause Analysis

**Status:** Investigated
**Date:** 2026-01-26
**Related:** `apps/desktop/docs/TERMINAL_RUNTIME_ARCH_REVIEW.md`

## Summary

Terminal viewport "jumps" or resets after reattach because Claude Code emits clear/redraw ANSI sequences (`ESC[2J`, `ESC[3J`, `ESC[H`). This happens ~200ms after snapshot restore.

## Symptoms

- Terminal view jumps to top when switching tabs
- Scrollback history is cleared
- Most noticeable with Claude Code and other TUI apps
- Also happens when pasting input into Claude Code

## Evidence

Observed in renderer logs during reattach:
```
[useTerminalStream] Detected scroll-affecting sequences in 41719b:
  - CUP_HOME: Cursor to home (count=1, positions=[16])
  - ED_FULL: Clear entire screen (count=1, positions=[8])
  - ED_SCROLLBACK: Clear scrollback buffer (count=1, positions=[12])
  Context: "...\x1b[?2026h\x1b[2J\x1b[3J\x1b[H\r\n..."
```

The sequence `\x1b[2J\x1b[3J\x1b[H`:
| Sequence | Name | Effect |
|----------|------|--------|
| `\x1b[2J` | ED_FULL | Clear entire screen |
| `\x1b[3J` | ED_SCROLLBACK | **Clear scrollback buffer** (destroys history) |
| `\x1b[H` | CUP_HOME | Cursor to home (top-left) |

## Root Cause

### Why Claude Code Emits These Sequences

TUI apps refresh their display in response to **SIGWINCH** (window size change signal). This is standard Unix terminal behavior.

### What WE Do That Triggers This

**We send two SIGWINCH signals during reattach:**

#### Signal 1: Immediate (`terminal-host.ts:162-163`)
```typescript
// For existing sessions, resize to match client dimensions
session.resize(request.cols, request.rows);
```

#### Signal 2: Delayed ~150-200ms (`useTerminalRestore.ts:318`)
```typescript
const scheduleFitAndScroll = () => {
  requestAnimationFrame(() => {
    fitAddon.fit();
    onResizeRef.current(xterm.cols, xterm.rows); // Another SIGWINCH
  });
};
```

### Timing Breakdown

```
T+0ms      : createOrAttach returns snapshot (restored correctly)
T+0ms      : First SIGWINCH sent (immediate resize)
T+150ms    : Debounced resize fires (RESIZE_DEBOUNCE_MS = 150)
T+150-200ms: Second SIGWINCH sent
T+200ms    : Claude Code receives SIGWINCH → emits \x1b[2J\x1b[3J\x1b[H
            → Scrollback wiped, viewport jumps
```

### Why Snapshot Doesn't Help

Snapshot is restored correctly at T+0ms, but streaming data at T+200ms contains `\x1b[3J` which wipes the restored state.

## Additional Triggers

### 1. Alt-Screen Entry (`useTerminalRestore.ts:365`)
```typescript
xterm.write("\x1b[?1049h", () => { ... })
```

### 2. Focus Reporting
If `focusReporting: true` (Claude Code enables this), xterm sends `\x1b[I` on focus gain, potentially triggering refresh.

### 3. Bracketed Paste (`helpers.ts:setupPasteHandler`)
```
\x1b[200~<content>\x1b[201~
```
May trigger TUI redraw.

## Files Involved

| File | Line | What |
|------|------|------|
| `apps/desktop/src/main/terminal-host/terminal-host.ts` | 162-163 | First resize on attach |
| `apps/desktop/src/main/terminal-host/session.ts` | 764-769 | `resize()` sends SIGWINCH |
| `apps/desktop/src/renderer/.../useTerminalRestore.ts` | 318 | Second resize after fit() |
| `apps/desktop/src/renderer/.../helpers.ts` | 568-576 | Debounced resize (150ms) |

## Debug Logging

**Daemon:** `export SUPERSET_DEBUG_SCROLL_SEQUENCES=1`
**Renderer:** `localStorage.setItem("SUPERSET_DEBUG_SCROLL_SEQUENCES", "1")`

## Fix Options

### Option 1: Skip Unnecessary Resize (Root Cause Fix)

Don't send SIGWINCH if dimensions haven't changed.

**terminal-host.ts:**
```typescript
const currentDims = session.getDimensions();
if (request.cols !== currentDims.cols || request.rows !== currentDims.rows) {
  session.resize(request.cols, request.rows);
}
```

**useTerminalRestore.ts:**
```typescript
if (xterm.cols !== result.snapshot?.cols || xterm.rows !== result.snapshot?.rows) {
  onResizeRef.current(xterm.cols, xterm.rows);
}
```

### Option 2: Filter `\x1b[3J` (Defensive)

Strip clear scrollback from streaming data:
```typescript
function filterClearScrollback(data: string): string {
  return data.replaceAll("\x1b[3J", "");
}
```

Apply in `useTerminalStream.ts` and `useTerminalRestore.ts` before `xterm.write()`.

## Recommendation

1. **Implement Option 1** (skip unnecessary resize) - addresses root cause
2. Test if paste-triggered refresh persists
3. If yes, add **Option 2** as defensive measure

## Testing

- [ ] Enable debug logging
- [ ] Run Claude Code, switch tabs → verify no scroll jump
- [ ] Paste into Claude Code → verify no scroll jump
- [ ] Test with vim, htop → verify TUI behavior intact
