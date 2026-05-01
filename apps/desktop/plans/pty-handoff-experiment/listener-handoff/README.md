# Listener-fd handoff spike

## What this answers

The Phase 2 plan needs the supervisor to pass a *listening* AF_UNIX socket fd
across two daemon processes so the new daemon can `accept()` without rebinding.
Phase 0 already proved PTY master fds survive parent exit via stdio inheritance.
This spike proves the same is true for **a listening socket fd**.

Specifically:

1. Can a parent (supervisor) create a `net.Server`, get its underlying fd, and
   pass it via the `stdio` array to a child (daemon A)?
2. Can daemon A wrap that inherited fd via `net.Server` + `server.listen({ fd })`
   and `accept()` connections on it?
3. Can the parent then spawn daemon B with the same fd in `stdio`, have daemon A
   exit, and have daemon B accept new connections on the *same socket path* with
   no rebind / no `EADDRINUSE`?
4. Does an existing client connection to daemon A survive while daemon B takes
   over for new connections?

The answer to (1)-(3) is "yes" per Node docs and the cluster module's behavior,
but we want a concrete confirmation in our toolchain (Bun-running supervisor +
Node-running daemon) before committing to the architecture.

## Layout

- `supervisor.js` — creates the listener, spawns daemon A, on signal swaps to
  daemon B, prints results.
- `daemon.js` — accepts on inherited fd, replies with `pid=NNN` on each
  connection.
- `client.js` — repeatedly connects, prints which pid answered.
- `run.sh` — drives the full sequence and exits 0 on success.

## Run

```sh
node supervisor.js
```

## Result (2026-05-01, macOS arm64, Node 24)

**PASS.** Sample run output:

```
[supervisor] spawned daemonA pid=29201
[daemon-A] listening on /tmp/spike-listener-29007.sock (bound fresh)
[daemon-A] ready
[supervisor] connect 1 -> from pid=29201
[supervisor] connect 2 -> from pid=29201
[supervisor] sending SIGUSR1 to daemonA (handoff)
[daemon-A] performing handoff
[daemon-A] listener fd is 12
[daemon-A] spawned successor pid=29600
[daemon-B] listening on inherited fd=3
[daemon-B] sent upgrade-ack to predecessor
[daemon-B] ready
[daemon-A] received ack: upgrade-ack pid=29600
[daemon-A] exiting after handoff (no server.close — preserves socket path)
[supervisor] daemonA exited code=0 signal=null
[supervisor] connect 3 -> from pid=29600
[supervisor] connect 4 -> from pid=29600
PASS — listener fd transferred from daemonA (pid 29201) to daemonB (pid 29600), no rebind needed
```

## Architectural shift this spike forced

The original Phase 2 plan called for the **supervisor** to obtain the daemon's
listening fd and pass it to the successor. The first iteration of the spike
attempted this; it failed because `_handle.close()` invalidates the underlying
fd, and there's no clean way to keep a Node `net.Server` from accepting on a
bound fd without closing the handle.

The working model: **the old daemon spawns the new daemon.** Old daemon dups
its own listener fd into the successor via the `stdio` array; supervisor isn't
in the fd-transfer path at all. After the successor sends `upgrade-ack`, the
old daemon updates the manifest (so supervisor's adopted-liveness adopts the
new pid) and exits.

This is a strictly better fit with Phase 1's existing architecture — adoption
is already the path supervisor uses to discover daemons after host-service
restarts. Handoff is just adoption with extra steps.

## Critical pitfall this spike caught

`net.Server.close()` unlinks the socket file's directory entry when the server
was bound by path. Even though the successor holds a dup'd fd that keeps the
in-kernel socket alive, after unlink, `connect("/tmp/.../*.sock")` returns
ENOENT — clients can't find their way to the still-listening socket.

**Fix:** the old daemon must NOT call `server.close()` on the handoff path.
`process.exit(0)` skips Node's close handlers, so the path stays linked. The
in-kernel socket stays alive via the successor's fd refcount.

This is now a hard requirement encoded in the implementation plan.

## What this validates for the implementation plan

- D1: PTY fds + listening socket fd inheritance via stdio works in our toolchain.
- The daemon-spawns-daemon model removes the need for daemon→supervisor fd
  transfer (the most uncertain piece of the original Step 7).
- The "brief window where new connects are dropped" during handoff is real but
  recoverable via client retry. Renderers already retry; xterm reconnect path
  handles this.

## Not tested by this spike (still open)

- Existing client connections to daemon A during handoff: today the spike
  drops them. For production, we'd want them to either drain cleanly or be
  explicitly told to reconnect. Out of scope for this fd-transfer spike.
- N=many sessions worth of PTY fd inheritance simultaneously (Phase 0 already
  validated up to 100; high-N still untested).
- Linux x86_64 — neither this spike nor Phase 0 has run there yet.
