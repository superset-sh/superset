# @superset/pty-daemon Backend Package Guidelines

## Scope
Standalone Node PTY daemon, Unix socket protocol, session store, handlers, server loop, flow control, and upgrade handoff.

## Source Examples
- `packages/pty-daemon/README.md` is the authoritative package design guide.
- `packages/pty-daemon/src/protocol/messages.ts` defines protocol messages.
- `packages/pty-daemon/src/protocol/framing.ts` implements length-prefixed JSON plus binary payload framing.
- `packages/pty-daemon/src/Server/Server.ts` implements socket lifecycle, flow control, and fd handoff.
- `packages/pty-daemon/test/no-encoding-hops.test.ts` guards byte fidelity source-level invariants.

## Local Patterns
- Keep the package standalone; no imports from host-service or app packages.
- Run daemon runtime under Node, not Bun. Bun is for build/unit tests.
- Keep binary PTY data out of JSON; use frame payload tails.
- Preserve 0600 Unix socket auth boundary and versioned handshake.
- Use pure handlers in `src/handlers` for control-plane operations where practical.

## Cross-Package Contracts
- Host-service consumes the public protocol and DaemonClient. Coordinate protocol changes with `packages/host-service/src/terminal/DaemonClient`.
- Desktop packaging supervises daemon through `apps/desktop/src/main/pty-daemon`.

## Avoid
- Do not add persistence to daemon session buffers.
- Do not reintroduce base64 or per-chunk UTF-8 decoding on the byte path.
- Do not add business rules to daemon sessions; the daemon is protocol and PTY ownership only.

## Validation
- `bun --cwd packages/pty-daemon test`
- `bun --cwd packages/pty-daemon run test:integration` for real PTY/handoff changes.
- `bun --cwd packages/pty-daemon typecheck`
