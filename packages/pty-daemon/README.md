# @superset/pty-daemon

Long-lived PTY-owning process for the v2 desktop terminal. host-service is a
client over a Unix socket; routine host-service upgrades don't touch shells.

Implements [Phase 1](../../apps/desktop/plans/done/20260429-pty-daemon-implementation.md)
(daemon owns PTYs across host-service restarts) and
[Phase 2](../../apps/desktop/plans/done/20260501-pty-daemon-phase2-implementation.md)
(fd-handoff so sessions survive daemon-binary upgrades too).

This package is **standalone**: it does not import from `@superset/host-service`
or any other workspace package. Host-service consumes only the protocol types
via `@superset/pty-daemon/protocol`.

## Runtime

**Production: Node ≥ 20** (Electron's bundled Node), via
`process.execPath` — exactly the same pattern as `host-service` already
uses today (`packages/host-service/build.ts` → `dist/host-service.js`,
spawned by `apps/desktop/src/main/lib/host-service-coordinator.ts`).
Bun is the build tool, not a runtime. **No new runtime in the desktop
app bundle.**

**Why not Bun at runtime:** verified during development that node-pty
1.2's master fd handling is incompatible with Bun 1.3 (`tty.ReadStream`
closes immediately, alternate `fs.createReadStream(null, { fd })`
returns EAGAIN with no recovery). The daemon needs a runtime where
node-pty actually works.

The dependency is pinned to `1.2.0-beta.14`: `1.1.0` leaked the temporary
`/dev/ptmx` descriptor opened by its macOS `posix_spawn` path once per PTY
spawn. The beta contains the upstream `/dev/ptmx` and kqueue descriptor fixes;
do not downgrade without rerunning the process-wide real-FD churn test.

**Dev:** unit tests run under Bun (`bun test`) for speed; integration
tests run under Node (`bun run test:integration`) since they touch real
PTYs. The daemon binary itself runs under Node in both dev and prod.

## Layout

```
src/
├── main.ts                     # Node entrypoint: argv → Server.listen()
├── index.ts                    # Public exports for host-service consumers
├── protocol/                   # Wire schemas + length-prefixed framing
│   ├── version.ts              # CURRENT_PROTOCOL_VERSION + supported list
│   ├── messages.ts             # ClientMessage / ServerMessage unions
│   ├── framing.ts              # encodeFrame / FrameDecoder (4-byte BE prefix)
│   └── index.ts
├── Pty/                        # node-pty thin wrapper with dim validation
│   ├── Pty.ts
│   └── index.ts
├── SessionStore/               # in-memory map + 64KB ring buffer per session
│   ├── SessionStore.ts
│   └── index.ts
├── handlers/                   # pure functions: open/input/resize/close/list/subscribe
│   ├── handlers.ts
│   └── index.ts
└── Server/                     # AF_UNIX SOCK_STREAM accept loop, handshake, dispatch
    ├── Server.ts
    └── index.ts

test/
├── helpers/
│   └── client.ts               # reusable test client: connect, send, waitFor, collect
├── integration.test.ts         # smoke / happy-path
├── control-plane.test.ts       # exhaustive control-plane coverage
├── byte-fidelity.test.ts       # daemon → host byte-perfectness canary
├── handoff.test.ts             # Phase 2 fd-handoff end-to-end
├── signal-recovery.test.ts     # SIGKILL-during-handoff teardown
├── server-fd-lifecycle.test.ts # server ownership paths with real OS fds
├── fd-lifecycle.test.ts        # real master-fd disposal under churn
└── no-encoding-hops.test.ts    # source-level grep: no base64 / per-chunk utf8 in the data path

build.ts                        # Bun bundler → dist/pty-daemon.js (target: node)
```

## Design notes

- **Stateless from the client's perspective.** Every protocol call carries
  full context. No client tracking, no session tombstones, no business
  rules. Single design principle from
  [the implementation plan](../../apps/desktop/plans/done/20260429-pty-daemon-implementation.md#the-single-design-principle).
- **Auth boundary = Unix socket file mode 0600.** No in-band tokens. The
  daemon trusts whoever can open the socket.
- **Buffer is in-memory only.** Survives host-service restarts (because the
  daemon does), but never persisted to disk. No SQLite, no scrollback files.
  v1's `HistoryManager` is explicitly out of scope.
- **PTY master ownership is explicit.** Natural exit, pane close, failed open,
  and normal daemon shutdown idempotently dispose native and adopted master
  descriptors. A predecessor intentionally skips disposal only after a
  successor acknowledges fd handoff, so TreeKiller and session continuity are
  preserved.
- **Protocol versioned from day one.** Handshake (`hello` / `hello-ack`)
  picks the highest mutually supported version.

## Testing

```sh
bun test                     # unit tests (protocol framing, handlers, SessionStore, Pty validation, byte-fidelity canary)
bun run test:integration     # integration tests under `node --test`: control-plane, handoff, signal-recovery, byte-fidelity-runtime
bun run typecheck            # tsc --noEmit
bun run build:daemon         # bundle src/main.ts → dist/pty-daemon.js (target: node)
```

What the integration suites prove:

- **`control-plane.test.ts`**: handshake/version negotiation; session lifecycle (invalid dims, duplicate ids, ENOENT, instant-exit, hung-shell SIGKILL); I/O (resize, burst, multi-byte UTF-8); multi-subscriber fan-out; detach + reattach (replay); concurrency; hostile input; framing across split chunks.
- **`handoff.test.ts`**: Phase 2 — sessions survive a daemon-binary swap with the same shell PIDs.
- **`fd-lifecycle.test.ts`**: native and adopted real master fds close
  idempotently, including repeated natural-exit churn.
- **`byte-fidelity.test.ts`**: random bytes (including non-UTF-8) flow daemon → host byte-perfect on live and replay.
- **`signal-recovery.test.ts`**: SIGKILL of the daemon mid-flight; clients see a clean close.
- **`no-encoding-hops.test.ts`** (bun): source-level guard — fails the moment anyone reintroduces a base64 hop or per-chunk `chunk.toString("utf8")` on the data path.

Why two runners? `bun test` is fast for pure-JS work. node-pty doesn't work
under Bun, so anything that spawns a real PTY runs under Node.

## Running locally

```sh
bun run start --socket=/tmp/pty-daemon.sock
```

Logs go to stderr; stdout stays empty (so the daemon can later be supervised
by host-service with stdout reserved for protocol or kept dark).

## Out of scope

- Windows ConPTY — not in the protocol; defer until Windows users justify it.
- "since byte N" replay cursor — would close the gap where bytes the PTY
  produced during a WS-down window are dropped on reconnect (sub-second on
  a daemon swap; longer on host-service restart). Not built.
