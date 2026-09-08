# Temporary v1 runtime lifecycle

`index.ts` owns v1 startup reconciliation and retirement. Its public surface is
`report(windowId, report)` and `forget(windowId)`; the migration router forwards
renderer reports, and platform windows invalidate them on navigation or close.
`controller.ts` handles window eligibility and concurrent retirement attempts;
`retire.ts` probes and shuts down the legacy daemon through injected operations.

The terminal client imports only `access.ts` to avoid a dependency cycle with the
lifecycle. `isV1RuntimeBlocked()` means every window has a locked migration, even
if an attached session or a failed probe has deferred actual cleanup. Keep that
distinction: blocking new connections must not wait for shutdown to succeed.

## When v1 is removed

- Delete this directory and the renderer's `V1RuntimeLifecycle` component and
  authenticated-layout mount.
- Remove `migration.reportV1Runtime`, the platform-window `forget` calls, and
  the terminal client's access guard along with the legacy terminal runtime.
- Remove the v1 filesystem service and git worker runner with their callers.
  Their disposal functions remain owned by those resources until then.
- Remove the retirement-only `markV1TerminalRetiring` handling when removing
  v1 agent hook tracking. Keep migration ledgers and resume data for as long as
  upgrades from v1 are supported.

The host-service root policy and workspace-fs search cap protect v2 as well.
They must survive removal of this desktop lifecycle. Any persisted renderer
keys whose writers disappear belong in `DEAD_KEYS` per `apps/desktop/AGENTS.md`.
