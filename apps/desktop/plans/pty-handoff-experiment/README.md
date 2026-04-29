# pty-handoff-experiment

Phase 0 reliability harness for the C2 architecture (`forkpty` + SCM_RIGHTS
fd-handoff across `exec`'d self), per
`apps/desktop/plans/20260428-pty-handoff-survival-architectures.md`.

## Build

```sh
go build -o pty-handoff .
```

## Run

```sh
./pty-handoff -n=20 -k=100 -workload=counter -outdir=./runs/n20k100
```

Flags:

- `-n=N`: number of PTY sessions
- `-k=K`: number of handoffs (each handoff = exec a new self, transfer all
  master fds via SCM_RIGHTS, ack, exit)
- `-workload=W`: `counter` (busy SEQ:n loop), `counter-slow` (10ms cadence),
  `idle` (`sleep 3600`), `vim` (curses), `tmux` (nested counter)
- `-outdir=DIR`: directory for `report.json` and `handoff_latencies.txt`

Final exit code is 0 if every shell is still alive at the end of K handoffs
*and* there are zero sequence-number gaps in the SEQ:n stream; 1 otherwise.

## What it tests

For each session:

- **Process continuity:** `kill(pid, 0)` after K handoffs. If the original
  shell PID is still alive after the parent process has exec'd K times, the
  C2 primitive (forkpty + setsid + dup'd master fd in new owner) works.
- **Byte continuity:** every line of output matches `^SEQ:(\d+)$`. The
  reader tracks the highest seq seen and reports any gap (expected, got).
  Zero gaps means no shell output was dropped across handoffs.
- **Handoff latency:** wall-clock time from "stop reader goroutines" to
  "ack received from new owner."
- **Scaling:** by varying N and K, tests whether per-handoff cost scales
  with sessions or with handoff count.

## Internals

Each generation of the binary either:

- **Parent (gen 0):** spawns N PTYs via `creack/pty`, sets each master fd
  non-blocking, starts a reader goroutine per session that parses SEQ:n
  lines and tracks gaps.
- **Re-exec'd child (`-child=true`, gen ≥ 1):** receives master fds + JSON
  metadata via `unix.Recvmsg` on fd 3 (its `ExtraFiles[0]`), wraps each as
  `*os.File`, resumes reading.

Handoff path (every K handoffs):

1. Stop reader goroutines (parallel signal + parallel wait).
2. Dup each master fd via `unix.Dup`. (Original `*os.File` is closed; dup
   keeps the fd alive for transfer.)
3. Marshal session metadata (sessionId, PID, lastSeq, partial buffer,
   gaps so far) into a length-prefixed JSON frame.
4. `Sendmsg` the frame + `unix.UnixRights(dupedFds...)` over a SOCK_STREAM
   AF_UNIX socketpair. (SOCK_SEQPACKET would be cleaner but isn't supported
   on AF_UNIX on macOS.)
5. Wait for 1-byte ack from the receiver.
6. Parent `exit(0)`. Receiver continues as gen+1.

Final generation runs the verification and writes `report.json`.

## Bugs found while writing the harness (now fixed)

- **Serial reader-stop blew up latency at N≥100** (50ms × N from the
  cancellation poll deadline). Fix: `stopAll` signals all sessions, then
  waits on all done channels — O(max), not O(sum).
- **SOCK_STREAM Sendmsg can split a JSON frame** at large session counts.
  Fix: `recvPayload` reads the rest of the length-prefixed frame after the
  initial `Recvmsg`. SCM_RIGHTS arrives with that first chunk regardless.
- **`SetReadDeadline` no-ops on creack/pty's master fd by default** (idle
  workload hung indefinitely). Fix: `unix.SetNonblock(fd, true)` after
  spawn, and again on every received fd after `Recvmsg` — SCM_RIGHTS does
  *not* preserve `O_NONBLOCK`.

## Results (macOS arm64, 2026-04-29)

See the `Phase 0 Results` section in the survey doc.

## Companion test: node-pty handoff (`nodepty-test/`)

Triggered by the question "can the daemon be Node-only?" Three small
Node scripts that test whether `node-pty`-spawned shells survive parent
exit when the master fd is held by another process via stdio
inheritance:

- `test1-survival.js` — control case, parent exits with no handoff
  (shells die — expected, master refcount → 0).
- `test2-handoff.js` — parent passes master fds to a child via
  `child_process.spawn`'s `stdio` array; parent exits; child holds the
  fds. Shells survive.
- `test3-counter-handoff.js` — same with a counter workload; child
  verifies it can read the live PTY output.

Findings (2026-04-29, Node 24 + node-pty 1.1 + macOS arm64): node-pty
behaves the same as creack/pty for handoff purposes — `term.pid` *is*
the shell PID (no long-lived helper), and shell-survival depends only
on master fd refcount. The original C1 PoC conclusion that node-pty's
spawn-helper kills bash was incorrect (or at least version-specific).

Implication: **the daemon can be Node-only.** Documented in the survey
doc's "Phase 0 Follow-up" section.

## Not yet run

- Linux x86_64
- macOS x86_64
- vim / tmux workloads (stubs exist, not exercised)
- SIGKILL stress (parent crashes mid-handoff)
- Very high N (1000+) — would test fd-table limits and cmsg buffer sizing
- SCM_RIGHTS-from-Node (would need `koffi` or N-API addon; conceptually
  equivalent to `stdio` fd inheritance for survival)
