# Pin host-service adoption to bundled version

## Problem

Today `host-service-coordinator.tryAdopt()` adopts any running host-service whose version satisfies `>= MIN_HOST_SERVICE_VERSION` — a manually-bumped floor in `packages/shared/src/host-version.ts`. After an Electron auto-update, the new desktop happily adopts a stale host-service as long as it clears the floor, so non-breaking host-service changes (patches, additive features) never reach users until someone remembers to bump the floor.

We want auto-updated desktops to always end up running the host-service binary that shipped with them.

## Why respawn is safe

Pty-daemon — the only process holding durable session state — has its own manifest + supervisor (`packages/host-service/src/daemon/DaemonSupervisor.ts`) and is adopted independently. Killing host-service drops only:

- tunnel-client WebSockets (auto-reconnect)
- the in-memory terminal sessions Map (rebuilt on re-attach via daemon-client)
- cached env

Real PTY state stays in the daemon across the swap.

## Change

Replace the floor check with an equality check against the host-service bundled into this Electron build. Reuse the existing kill+respawn path.

1. Inject `BUNDLED_HOST_SERVICE_VERSION` into the desktop main bundle at build time (read `packages/host-service/package.json` version), mirroring the `EXPECTED_DAEMON_VERSION` pattern at `packages/host-service/src/daemon/expected-version.ts`.
2. In `apps/desktop/src/main/lib/host-service-coordinator.ts:289-308`, replace
   ```ts
   !semver.satisfies(version, `>=${MIN_HOST_SERVICE_VERSION}`)
   ```
   with strict equality:
   ```ts
   version !== BUNDLED_HOST_SERVICE_VERSION
   ```
   The Electron build is the source of truth for which host-service runs against it. Any drift — older or newer — gets killed and respawned from the bundled binary. This keeps the cloud/desktop deploy contract tight (only one host-service version is ever live alongside a given desktop) and avoids the "hand-rolled newer daemon sticks around indefinitely" failure mode.
3. Keep `MIN_HOST_SERVICE_VERSION` only for the renderer-side **remote** host gate at `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/hooks/useRemoteHostStatus/useRemoteHostStatus.ts:91`. We can't kill remote hosts — a floor is still the right shape there.

Everything else is unchanged: `detached: true` spawn, manifest re-adoption on next start, crash circuit breaker, daemon lifecycle.

## Behavior after change

- **Auto-update ships new host-service version** → next Electron launch: adoption check fails, manifest PID gets SIGTERM, fresh host-service spawns from the bundled binary. One brief tunnel reconnect.
- **Auto-update ships same host-service version** → adoption succeeds, no respawn.
- **Dev: locally newer host-service** → killed and replaced with the bundled version. If you need to test against a newer daemon in dev, point the desktop at a build that bundles it; don't hand-roll the running process.
- **Pty-daemon** → never killed by this path; survives across host-service swaps as designed.

## Open questions

- **Drain before SIGTERM?** Today line 304 is a hard kill. If respawn cadence becomes user-visible (tunnel reconnect storms), add a short drain — stop accepting new connections, wait N seconds — before SIGTERM. Not needed in v1.

## Out of scope

- Pty-daemon version pinning (already handled by `DaemonSupervisor` + `EXPECTED_DAEMON_VERSION`).
- Changing `MIN_HOST_SERVICE_VERSION` semantics for the remote-host renderer gate.
- Any auto-update lifecycle changes — host-service and pty-daemon still must not be torn down by the auto-updater itself; the respawn happens on the *next* launch via the existing adoption path.
