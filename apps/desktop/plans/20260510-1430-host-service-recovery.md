# Host-Service Recovery: Self-Healing + In-App Escape Hatch

**Status:** Draft
**Scope:** v2 desktop only — `apps/desktop/src/main/lib/host-service-coordinator.ts`, `apps/desktop/src/lib/trpc/routers/host-service-coordinator/index.ts`, `apps/desktop/src/renderer/routes/_authenticated/providers/LocalHostServiceProvider/*`, `apps/desktop/src/main/lib/tray/index.ts`, plus a new Settings section.
**Tracking issue:** [superset-sh/superset#4299](https://github.com/superset-sh/superset/issues/4299)

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

### 1. Health-check during adoption  *(highest impact, near-zero risk)*

**File:** `apps/desktop/src/main/lib/host-service-coordinator.ts:280-315`

Before registering an adopted manifest as `running`, do a `pollHealthCheck(manifest.endpoint, manifest.authToken, 2_000)`. On failure: SIGKILL the pid, `removeManifest(orgId)`, return null so `start` falls through to `spawn`.

```ts
private async tryAdopt(organizationId: string): Promise<Connection | null> {
  const manifest = this.readAndValidateManifest(organizationId);
  if (!manifest) return null;

  // … existing app-version gate …

  const healthy = await pollHealthCheck(manifest.endpoint, manifest.authToken, 2_000);
  if (!healthy) {
    console.log(`[host-service:${organizationId}] Adopted pid=${manifest.pid} did not respond; killing`);
    try { process.kill(manifest.pid, "SIGKILL"); } catch {}
    removeManifest(organizationId);
    return null;
  }

  // … existing register-and-return …
}
```

Fixes **bucket A**. Invisible when adoption is healthy. Adds at most ~2s to coordinator start when adoption fails — acceptable; it only triggers on app launch / Cmd+R.

**Tests:** unit test for the new path in `host-service-coordinator.test.ts` — mock `pollHealthCheck` to return false, assert `tryAdopt` returns null, manifest is removed, pid received SIGKILL.

### 2. Coordinator `reset(orgId)` + tRPC surface  *(unlocks 3 and 5)*

**File:** `apps/desktop/src/main/lib/host-service-coordinator.ts`, `apps/desktop/src/lib/trpc/routers/host-service-coordinator/index.ts`

Add:

```ts
async reset(
  organizationId: string,
  config: SpawnConfig,
  options: { wipeHostDb?: boolean } = {},
): Promise<Connection> {
  // 1. Stop in-memory + send SIGTERM
  this.stop(organizationId);

  // 2. SIGKILL any pid the manifest still references (covers the
  //    "process up but unresponsive" case that motivated bucket A).
  const manifest = readManifest(organizationId);
  if (manifest && isProcessAlive(manifest.pid)) {
    try { process.kill(manifest.pid, "SIGKILL"); } catch {}
  }

  // 3. Remove manifest
  removeManifest(organizationId);

  // 4. Optional: archive host.db to host.db.broken-<ts> so we keep
  //    the file for debugging but the next spawn starts clean.
  if (options.wipeHostDb) {
    const dbPath = path.join(manifestDir(organizationId), "host.db");
    if (fs.existsSync(dbPath)) {
      fs.renameSync(dbPath, `${dbPath}.broken-${Date.now()}`);
    }
  }

  // 5. Fresh start
  return this.start(organizationId, config);
}
```

Expose via `hostServiceCoordinator.reset` in the tRPC router, mirroring the existing `restart` shape (takes `organizationId`, loads token from `loadToken()`, threads `cloudApiUrl`). Add an `wipeHostDb: z.boolean().optional()` input.

The default is **not** to wipe host.db — that's data loss. The Settings UI surfaces "Reset" (manifest only) and "Reset and clear local data" (also archives host.db) as separate actions.

**Tests:** coordinator unit test that `reset` removes the manifest, the optional rename happens only when requested, and the new `start` produces a running instance.

### 3. Surface failures with a recovery banner  *(visibility — the actual user fix)*

**File:** `LocalHostServiceProvider.tsx` + new `WorkspaceHostUnavailableBanner` component.

Today `activeHostUrl === null` is silent. Change the contract:

- Provider tracks "did we attempt `start` for the active org, and has it been stopped/null longer than 5s?"
- When true, render a banner above the workspace content with:
  - The last known status from `coordinator.onStatusChange` (`starting` / `stopped`) + any error message from the failed `start` mutation.
  - Two actions: **Reset host service** (`reset(orgId, { wipeHostDb: false })`) and **Get diagnostics** (copies manifest path + last 200 log lines to clipboard, for paste into bug reports).

The banner needs `select-text cursor-text` per `apps/desktop/AGENTS.md` so users can copy errors.

Hook the banner into the workspace right-pane shell so it appears in place of the blank skeleton — not as a toast (toasts auto-dismiss; this state is sticky).

**Tests:** RTL test that mounts the provider with a mocked `start` mutation that throws, advances time past 5s, and asserts the banner renders with the expected error and actions.

### 4. Renderer retry with exponential backoff  *(covers transient C/D)*

**File:** `LocalHostServiceProvider.tsx`

Subscribe to `electronTrpc.hostServiceCoordinator.onStatusChange.useSubscription`. When status for the active org transitions to `stopped` (or `start` mutation throws), schedule a re-`start` with backoff: 1s, 4s, 15s, then give up. Cap visible to the user via the banner from (3) — after backoff exhausts, the banner says "Auto-retry exhausted, click Reset."

This fixes the **transient** half of bucket C (port race, slow disk on boot) and is the cheapest way to handle bucket B after a sign-in: as soon as `loadToken` returns a token, the next retry succeeds.

**Tests:** RTL test using fake timers — assert exactly three retries fire on stop events.

### 5. Tray "Restart" enabled in `stopped`  *(one-liner, always-correct)*

**File:** `apps/desktop/src/main/lib/tray/index.ts:172-200`

```ts
// Before: enabled: isRunning,
// After: enabled: status !== "starting",
```

`stopped` is the state where Restart is most useful; gating it on `running` is backwards.

### 6. Settings → Advanced → "Reset host service" button  *(belt and suspenders)*

**File:** new section in Settings (the Experimental panel feels right, since V2 toggle lives there). Reuses the tRPC `reset` mutation from (2). Two buttons:

- **Reset host service** — calls `reset({})`. Safe; loses no data.
- **Reset and clear local host data** — calls `reset({ wipeHostDb: true })`. Behind a confirm dialog that names what's lost (terminal session history, host-side chat state) and what survives (workspaces, projects, chats — those live in `@superset/local-db`).

Lower priority than the in-context banner from (3) because a user who can't load workspaces probably won't think to open Settings, but it's useful from a support perspective ("ask them to click this button").

## Out of scope

- **Why host-service crashes in the first place.** The "right pane went blank then Cmd+R" half of #4299 is a different bug — something in the workspace render path or host-service runtime that we should track separately. This plan only handles the *recovery* once it has crashed.
- **Auto-wiping `host.db`.** Data loss without a confirm dialog is non-negotiable.
- **Touching the start mutation semantics.** Other call sites depend on `start` being idempotent and resolving once.
- **Cross-org healing.** We retry/reset only the active org. Inactive orgs are out of scope; their host-service can be healed by switching to them.

## Rollout

- **Order:** (1) and (5) ship first as a small PR — no UI changes, easy to revert. (2)+(3)+(4) ship as a second PR — that's the user-facing recovery story. (6) tacks on after.
- **Telemetry:** log `[host-service-coordinator] adoption health check failed` (1), `reset(orgId)` invocation source (banner vs tray vs settings) (2/3/6), retry attempt counts (4). PostHog event `host_service_recovery` with `{ source, action, succeeded }`.
- **Risk:** the adoption health check briefly extends coordinator startup on the unhappy path. Bound by `2_000ms`, and only triggers when adoption would have failed silently anyway, so the worst case is "startup is slightly slower when host-service was broken" — strictly better than current.

## Acceptance criteria

For #4299 to be considered closed by this work:

- [ ] A user reproducing the issue can recover without filesystem access, in ≤2 clicks from the blank workspace screen.
- [ ] If the manifest points at a non-responsive pid, the next Cmd+R or app launch heals automatically (no user action).
- [ ] If host-service spawn is failing for a persistent reason (e.g., port binding error), the banner names the reason in copyable text.
- [ ] Tray → Restart works in `stopped` state.
- [ ] No regression in startup time for the happy path (verified via dev-tools timing on a freshly-cloned `.superset` dir).
