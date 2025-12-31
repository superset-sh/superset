# Large Paste into `vi` — Postmortem & Fix

## Problem
Pasting large blocks of text (e.g. 3k+ lines) into `vi` inside Superset Desktop’s persistent terminal could:
- hang the terminal daemon / freeze all terminals, or
- partially paste and then silently stop (missing chunks).

This was most visible on macOS (small kernel PTY buffer + very high output volume during `vi` repaints).

## What Was Actually Happening
There were two distinct failure modes.

### 1) CPU saturation on output (daemon side)
Large pastes cause `vi` to repaint aggressively, producing huge volumes of escape-sequence-heavy output. If the daemon tries to parse and apply that output to the headless xterm emulator in large, unbounded chunks, it can monopolize the event loop and trigger request timeouts / “frozen terminals”.

### 2) Backpressure on input (PTY write side)
PTY writes must respect backpressure. When writing directly to a PTY file descriptor in non-blocking mode, the kernel can return:
- `EAGAIN` / `EWOULDBLOCK` (normal: PTY buffer full)

If `EAGAIN` is treated as fatal (or if the queue is cleared on error), paste chunks get dropped.

## Final Fix (Working)
The solution is end-to-end flow control + isolation.

### Process isolation (per terminal)
Each PTY runs in its own subprocess (`apps/desktop/src/main/terminal-host/pty-subprocess.ts`). One terminal hitting backpressure can’t freeze the daemon or other terminals.

### Binary framing (no JSON/NDJSON on hot paths)
Subprocess ↔ daemon communication uses a small length-prefixed binary framing protocol (`apps/desktop/src/main/terminal-host/pty-subprocess-ipc.ts`) to avoid JSON stringify/parse overhead on escape-heavy output.

### Output batching + stdout backpressure
Subprocess batches PTY output (32ms cadence, 128KB max) and pauses PTY reads when `process.stdout` is backpressured.

### Input backpressure (retry, don’t drop)
Subprocess writes to the PTY fd via async `fs.write()` (when fd is available) and treats `EAGAIN`/`EWOULDBLOCK` as expected backpressure:
- keeps the queued buffers
- retries with exponential backoff (2ms → 50ms)
- pauses upstream `stdin` when backlog exceeds a high watermark and resumes once drained

### Daemon responsiveness (time-sliced emulator)
The daemon applies PTY output to the headless emulator in time-budgeted slices to avoid long single-tick stalls during heavy output bursts.

### Renderer paste behavior
Renderer wraps clipboard pastes with bracketed paste sequences and chunks large payloads to reduce burstiness.

## Debugging / Observability
Set these env vars and restart the app:
- `SUPERSET_PTY_SUBPROCESS_DEBUG=1` — subprocess batching + PTY input backpressure logs
- `SUPERSET_TERMINAL_EMULATOR_DEBUG=1` — daemon emulator budget/overrun logs

Helpful process inspection:
```bash
ps aux | rg "terminal-host|pty-subprocess" -n
```

## Repro / Verification
1. Start the desktop app (`apps/desktop`).
2. Open a terminal, run `vi tmp.txt` and enter insert mode (`i`).
3. Paste ~3000+ lines.
4. Verify `vi` receives all lines (save to disk and check line count) and other terminals remain responsive.
