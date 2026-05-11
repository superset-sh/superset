# Host-Service Recovery: Self-Healing + In-App Escape Hatch

**Status:** PR1 shipped ([#4395](https://github.com/superset-sh/superset/pull/4395)). PR2 (items 2 + 3 + 4) ready for handoff. PR3 (item 6) optional follow-up.
**Scope:** v2 desktop only — `apps/desktop/src/main/lib/host-service-coordinator.ts`, `apps/desktop/src/lib/trpc/routers/host-service-coordinator/index.ts`, `apps/desktop/src/renderer/routes/_authenticated/providers/LocalHostServiceProvider/*`, `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/*`, `apps/desktop/src/main/lib/tray/index.ts`, plus a new Settings section.
**Tracking issue:** [superset-sh/superset#4299](https://github.com/superset-sh/superset/issues/4299)
**Related:** [#4396](https://github.com/superset-sh/superset/issues/4396) (white-screen / unbounded `ioreg execFileSync` — separate fix path, not blocked by this plan).

## Goal

When host-service is unreachable, the V2 right-pane goes silently blank and the user has no in-app recovery path — every interactive surface that needs host-service errors with `"Host service not available"`, including the **delete workspace** action, so the user can't even clean up. Today the only working recovery is filesystem surgery (`mv ~/.superset/host …`).

This plan adds:

1. **Self-healing** — adopt only host-services that actually respond, and retry start when status flips to `stopped`.
2. **A user-visible escape hatch** — a "Reset host service" action surfaced both as a banner when the right-pane would otherwise be blank, and as a button in Settings.
3. **Honesty in the tray** — let users click "Restart" when host-service is actually in the state where restart helps.

## Why

From #4299 the reporter is stuck in this state:

- Workspaces list renders (it's hydrated from local-db, not host-service).
- Clicking any workspace shows nothing on the right — every V2 surface uses `useLocalHostService().activeHostUrl`, which is `null`.
- Delete workspace errors `"Host service unavailable"`.
- Account-management section sits in skeleton forever (also a host-service call).
- Sign-out + sign-in, Cmd+R, Quit Completely, Tray → Restart, V1/V2 toggle — none recover.
- Manual fix: deleting `~/.superset/host/<orgId>/manifest.json` and relaunching. There is no in-app equivalent today.

Symptoms aside, the architectural problem is that **`activeHostUrl === null` is a permanently absorbing state**: nothing in the renderer or main ever tries to climb out of it after the first `start({orgId})` mutation fails or after adoption silently picks up a dead process.

## Current state

The pipeline that produces `activeHostUrl`:

| Step | Where |
| --- | --- |
| Renderer fires `start({orgId})` once per org on mount | `apps/desktop/src/renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider.tsx:48-52` |
| Renderer polls `getConnection({activeOrgId})` every 5s | `LocalHostServiceProvider.tsx:59-63` |
| `start` → coordinator: `tryAdopt` then `spawn` | `apps/desktop/src/main/lib/host-service-coordinator.ts:74-102` |
| `tryAdopt` only verifies `isProcessAlive(pid)` and app-version match | `host-service-coordinator.ts:280-315` |
| `spawn` health-checks via `pollHealthCheck` then registers `running` | `host-service-coordinator.ts:333-437` |
| `getConnection` returns null unless an instance is `running` | `host-service-coordinator.ts:155-163` |
| Tray "Restart" is gated on `isRunning` | `apps/desktop/src/main/lib/tray/index.ts:172-200` |

### The four failure buckets

| # | Bucket | Why we get stuck |
|---|--------|------------------|
| A | Stale/unhealthy adopted process | `tryAdopt` doesn't health-check. A live-pid-but-not-serving process is adopted; `getConnection` returns its dead port forever. |
| B | Auth token missing | `start` throws `"No auth token available"` (coordinator router line 17). Renderer's `useEffect` doesn't retry. |
| C | Spawn fails | `pollHealthCheck` timeout, port collision, DB lock, env validation. Instance is deleted; renderer's `useEffect` doesn't retry. |
| D | activeOrganizationId mismatch | `start` is fired for every org in collections, but `getConnection` is queried only for the session's `activeOrganizationId`. If the two drift (stale session, sync race), host-service is up but the renderer is asking about the wrong org. |

Buckets A and C/D account for the issue thread. B is the easiest to reproduce locally (clear keychain).

## Ranked work

Ranking criteria: **impact** (how many buckets the change unsticks) × **visibility** (does the user know it happened) ÷ **risk + effort**.

### 1. Health-check during adoption  *(shipped in PR #4395)*

**Status:** ✅ Shipped. See `apps/desktop/src/main/lib/host-service-coordinator.ts:307-326` for the implementation and `apps/desktop/src/main/lib/host-service-coordinator.test.ts` for the regression test.

Fixes **bucket A** structurally — every Cmd+R / app launch now health-checks the adopted manifest endpoint with a 2s timeout, SIGKILLs unresponsive pids, and falls through to a clean `spawn`. Invisible when adoption is healthy.

### 2. Coordinator `reset(orgId)` + tRPC surface  *(PR2 — unlocks 3 and 6)*

**Files to edit:**
- `apps/desktop/src/main/lib/host-service-coordinator.ts` — add method on the class, alongside `restart` (currently at ~`148-156`).
- `apps/desktop/src/lib/trpc/routers/host-service-coordinator/index.ts` — add a `reset` mutation, mirroring `restart` (currently at lines 37-47). Existing imports already include `loadToken` and `env.NEXT_PUBLIC_API_URL`.

Add to `HostServiceCoordinator`:

```ts
async reset(
  organizationId: string,
  config: SpawnConfig,
  options: { wipeHostDb?: boolean } = {},
): Promise<Connection> {
  // 1. Stop in-memory + send SIGTERM. No-op if no instance is tracked.
  this.stop(organizationId);

  // 2. SIGKILL any pid the manifest still references (covers the
  //    "process up but unresponsive" case that motivated bucket A).
  const manifest = readManifest(organizationId);
  if (manifest && isProcessAlive(manifest.pid)) {
    try { process.kill(manifest.pid, "SIGKILL"); } catch {}
  }

  // 3. Remove manifest so adoption can't pick up the stale entry.
  removeManifest(organizationId);

  // 4. Optional: archive host.db to host.db.broken-<ts> so we keep
  //    the file for debugging but the next spawn starts clean.
  if (options.wipeHostDb) {
    const dbPath = path.join(manifestDir(organizationId), "host.db");
    if (fs.existsSync(dbPath)) {
      fs.renameSync(dbPath, `${dbPath}.broken-${Date.now()}`);
    }
  }

  // 5. Fresh start.
  return this.start(organizationId, config);
}
```

Router shape:

```ts
reset: publicProcedure
  .input(orgInput.extend({ wipeHostDb: z.boolean().optional() }))
  .mutation(async ({ input }) => {
    const coordinator = getHostServiceCoordinator();
    const { token } = await loadToken();
    if (!token) {
      throw new Error("No auth token available — user must be logged in");
    }
    return coordinator.reset(
      input.organizationId,
      { authToken: token, cloudApiUrl: env.NEXT_PUBLIC_API_URL },
      { wipeHostDb: input.wipeHostDb },
    );
  }),
```

The default is **not** to wipe host.db — that's data loss. Settings UI (item 6) surfaces "Reset" (manifest only) and "Reset and clear local data" (also archives host.db) as separate actions.

**Tests:** extend `host-service-coordinator.test.ts` (already mocks `host-service-manifest`, `host-service-utils`, etc.) with three cases:
1. `reset` with no `wipeHostDb` removes the manifest, calls `start`, returns a new connection.
2. `reset({ wipeHostDb: true })` renames `host.db` to `host.db.broken-<ts>` (mock `fs.renameSync`).
3. `reset` is safe to call when no instance is tracked (no manifest, no pid).

### 3. Surface failures with a recovery state  *(PR2 — the actual user fix)*

**Pattern to follow:** the v2 workspace layout (`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/layout.tsx:87-101`) **already** renders `<WorkspaceHostOfflineState>` when `useRemoteHostStatus` reports `offline` for a remote host. The local-host branch is currently a gap — when `isLocal && activeHostUrl === null` we render the workspace anyway and downstream calls toast `"Host service not available"`. Mirror the remote pattern for the local case.

**Files to create / edit:**
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/hooks/useLocalHostStatus/useLocalHostStatus.ts` (new). Returns `"skip" | "loading" | "stopped" | "ready"`. Status is `"stopped"` when the workspace is local (`workspace.hostId === machineId`), the provider has attempted `start` for the active org, and `activeHostUrl` has stayed null for ≥5s. Read status events from `electronTrpc.hostServiceCoordinator.onStatusChange.useSubscription`, plus the most recent `start`-mutation error (lift the mutation result up from `LocalHostServiceProvider` into context).
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/components/WorkspaceLocalHostStoppedState/WorkspaceLocalHostStoppedState.tsx` (new). Two-button UI (mirror `WorkspaceHostOfflineState` styling so it doesn't feel grafted on):
  - **Reset host service** — calls `electronTrpc.hostServiceCoordinator.reset.useMutation({ wipeHostDb: false })`.
  - **Copy diagnostics** — copies a small text blob to clipboard: manifest path, manifest JSON (via a new `hostServiceCoordinator.getDiagnostics(orgId)` query if needed, or just print `~/.superset/host/<orgId>/`), last `start` mutation error, and the current status. Use the existing `select-text cursor-text` convention from `apps/desktop/AGENTS.md` so users can copy from the rendered text directly.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/layout.tsx` — add a branch above the `hostStatus.status === "offline"` block that renders `WorkspaceLocalHostStoppedState` when `useLocalHostStatus(workspace)` returns `"stopped"`.
- `apps/desktop/src/renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider.tsx` — expose the latest `start` mutation error and a "last attempt timestamp" on the context. (Currently the mutation result is discarded.)

**Why this shape, not a toast or top-bar banner:** `WorkspaceHostOfflineState` already establishes the pattern of replacing the workspace content when the host is unreachable, and the failure here is sticky (not a one-shot error). Reusing the slot keeps the design system consistent and means the recovery action appears exactly where the user is trying to work.

**Tests:**
- RTL test for `useLocalHostStatus`: mount with mocked context where `activeHostUrl` is null and last-attempt was >5s ago → assert `"stopped"`. <5s → `"loading"`. Remote workspace → `"skip"`.
- RTL test for `WorkspaceLocalHostStoppedState`: clicking **Reset host service** fires the `reset` mutation; clicking **Copy diagnostics** calls `navigator.clipboard.writeText` with text containing the manifest path.

### 4. Renderer retry with exponential backoff  *(PR2 — covers transient C/D)*

**File:** `apps/desktop/src/renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider.tsx`

The current `useEffect` (lines 48-52) fires `start({orgId})` exactly once on mount and never again. Wrap that effect with retry-on-failure:

- Subscribe to `electronTrpc.hostServiceCoordinator.onStatusChange.useSubscription` (already exported by the router at `apps/desktop/src/lib/trpc/routers/host-service-coordinator/index.ts:49-56`).
- When the active org's status transitions to `stopped` (or the most recent `start` mutation errors), schedule a re-`start` with backoff: 1s, 4s, 15s. After three attempts, stop retrying and let the recovery state from (3) take over.
- Reset the backoff counter when status reaches `running`.

Pattern note: subscription must use the observable pattern, not async generators (`apps/desktop/AGENTS.md` covers why). The router already does this correctly.

This fixes the **transient** half of bucket C (port race, slow disk on boot) and is the cheapest way to handle bucket B after a sign-in: as soon as `loadToken` returns a token, the next retry succeeds without the user clicking anything.

**Tests:** RTL test using fake timers — push three `stopped` events into the mocked subscription, advance time, assert exactly three `start` mutations fire at 1s/4s/15s, and a `running` event after the second attempt resets the counter.

### 5. Tray "Restart" enabled in `stopped`  *(shipped in PR #4395)*

**Status:** ✅ Shipped. See `apps/desktop/src/main/lib/tray/index.ts:171-176`.

### 6. Settings → Advanced → "Reset host service" button  *(PR3 — belt and suspenders)*

**File:** new section in `apps/desktop/src/renderer/routes/_authenticated/settings/`. The Experimental panel is the right home (the V2 toggle already lives there). Reuses the tRPC `reset` mutation from (2). Two buttons:

- **Reset host service** — calls `reset({ wipeHostDb: false })`. Safe; loses no data.
- **Reset and clear local host data** — calls `reset({ wipeHostDb: true })`. Behind a confirm dialog that names what's lost (terminal session history, host-side chat state) and what survives (workspaces, projects, chats — those live in `@superset/local-db`, not `host.db`).

Lower priority than the in-context recovery from (3) because a user who can't load workspaces probably won't think to open Settings, but it's useful from a support perspective ("ask them to click this button").

## Out of scope

- **The white-screen path.** Tracked separately at [#4396](https://github.com/superset-sh/superset/issues/4396) — `getHostId()` on macOS shells out to `ioreg` via `execFileSync` with no timeout, blocking the main event loop when subprocess spawning is blocked by sandboxing tools. Fix lands independently.
- **Auto-wiping `host.db`.** Data loss without a confirm dialog is non-negotiable.
- **Touching the `start` mutation semantics.** Other call sites depend on `start` being idempotent and resolving once.
- **Cross-org healing.** We retry/reset only the active org. Inactive orgs are out of scope; their host-service can be healed by switching to them.

## Rollout

- **Order:** (1)+(5) shipped as PR #4395. (2)+(3)+(4) ship together as PR2 — that's the user-facing recovery story. (6) tacks on as PR3.
- **Telemetry:** PostHog event `host_service_recovery` with `{ source: "banner" | "tray" | "settings", action: "reset" | "retry" | "wipe", succeeded: boolean }`. Wire from the renderer at each click-handler. Server-side, the coordinator already `console.log`s adoption health-check failures (PR1) — keep those.
- **Risk:** Renderer retry could mask a deterministic spawn failure under three rounds of backoff if the recovery state isn't surfaced clearly. Mitigate by making (3) and (4) ship together: the retry counter is visible in the recovery state, and after exhaustion the UI says "Auto-retry exhausted, click Reset."

## Acceptance criteria

For #4299 to be considered closed by this work:

- [x] If the manifest points at a non-responsive pid, the next Cmd+R or app launch heals automatically (PR1).
- [x] Tray → Restart works in `stopped` state (PR1).
- [ ] A user reproducing the issue can recover without filesystem access, in ≤2 clicks from the blank workspace screen (PR2).
- [ ] If host-service spawn is failing for a persistent reason (e.g., port binding error), the recovery state names the reason in copyable text (PR2).
- [ ] No regression in startup time for the happy path (verified via dev-tools timing on a freshly-cloned `.superset` dir).

## Handoff checklist for PR2

A new implementer picking this up should:

1. **Read PR #4395** to see the patterns already in place: the coordinator test file structure (`apps/desktop/src/main/lib/host-service-coordinator.test.ts`) and the `pollHealthCheck` usage.
2. **Read `useRemoteHostStatus` + `WorkspaceHostOfflineState`** in `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/` — PR2's local-host equivalent should mirror these in shape and visual style.
3. **Implement in order:** (2) coordinator `reset` → tRPC `reset` → renderer mutation hook; then (4) retry loop in `LocalHostServiceProvider`; then (3) `useLocalHostStatus` + `WorkspaceLocalHostStoppedState` + layout branch. (2) before (3) so the recovery component has the mutation to call; (4) before (3) so the recovery state knows when to surface (after backoff exhausts).
4. **Verify each test can fail** — for every new test, mutate the implementation to confirm the test catches the regression. (Project convention; see `apps/desktop/AGENTS.md` and the existing coordinator test.)
5. **Lint and typecheck before pushing.** `bun run lint` (from repo root) treats Biome warnings as errors. `bun run typecheck` in `apps/desktop`.

Files touched by PR2 (preview):

- `apps/desktop/src/main/lib/host-service-coordinator.ts` (add `reset` method)
- `apps/desktop/src/main/lib/host-service-coordinator.test.ts` (extend with reset tests)
- `apps/desktop/src/lib/trpc/routers/host-service-coordinator/index.ts` (add `reset` mutation)
- `apps/desktop/src/renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider.tsx` (expose error / last-attempt, add retry loop)
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/hooks/useLocalHostStatus/{useLocalHostStatus.ts,useLocalHostStatus.test.ts,index.ts}` (new)
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/components/WorkspaceLocalHostStoppedState/{WorkspaceLocalHostStoppedState.tsx,WorkspaceLocalHostStoppedState.test.tsx,index.ts}` (new)
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/layout.tsx` (add branch above the offline branch)
