# V2 paths — worktree-scaling perf fix plan

**Branch:** `v2-paths-worktree-perf`
**Date:** 2026-05-02
**Companion doc:** [`v2-paths-worktree-perf-findings.md`](./v2-paths-worktree-perf-findings.md)

This plan addresses the steady-state worktree-scaling costs identified in the findings audit. The goal: host-service idle CPU and JS heap should be roughly **flat** as worktree count grows, not linear.

Each fix has a verification step against the existing reproduction tests / benchmarks. After all fixes land, those benchmarks should show the post-fix numbers cited in the "target" rows.

---

## Current state

- **Branch:** `v2-paths-worktree-perf`.
- **All 4 in-scope fixes landed.** Fix #5 remains deferred (measure post-merge before re-scoping).
- **Suite status:** `packages/host-service` 460/460 passing including the new event-driven steady-state integration test. `packages/workspace-fs` 43/43 passing.

---

## Fix order

| # | Fix | Severity | Effort | Where | Status |
|---|-----|----------|--------|-------|--------|
| 1 | Event-driven `pull-requests` runtime via `GitWatcher.onChanged` | 🔴 CRITICAL | Medium | `packages/host-service` | ✅ landed |
| 2 | LRU + idle-TTL cap on `searchIndexCache` | 🔴 IMPORTANT | Small | `packages/workspace-fs` | ✅ landed |
| 3 | LRU cap on per-watcher `pathTypes` | 🔴 IMPORTANT | Small | `packages/workspace-fs` | ✅ landed |
| 4 | Loosen `refreshEligibleProjects` to 5-min safety net | 🟡 LOW | Trivial | `packages/host-service` | ✅ landed |
| 5 | (Deferred) Lazy GitWatcher registration | ⚪ DEFER | Large | `packages/host-service` | deferred |

### Measured impact of landed fixes

Workspace-fs (`cache-and-paths-memory.bench.test.ts`):

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| Heap @ 130 cached worktree indexes | +6.87 MB | +2.02 MB | 71% |
| Heap @ 20k unique paths in `pathTypes` | +8.69 MB | +2.54 MB | 71% |
| `pathTypes.size` @ 20k unique paths | 20,000 | 10,000 (capped) | hard cap |
| `searchIndexCache` retained entries @ 130 worktrees | 130 (linear) | 12 (cap) | hard cap |

Host-service pull-requests runtime (`pull-requests-scaling.bench.test.ts`):

| Metric | Before | After |
|--------|--------|-------|
| Idle tick @ N=20 | 1450 ms / 30 s = **48 ms/s** of git-subprocess waste | 0 ms (no idle ticks) |
| Real branch change → DB update latency | ≤ 30 s | **427 ms** (one measurement, N=5) |
| Safety-net sweep cadence | every 30 s | every 5 min |
| Daily safety-net cost @ N=20 | 1450 ms × 2880 ticks/day = **70 min/day** | 1450 ms × 288 sweeps/day = **7 min/day** |

The big shift: idle worktrees now cost 0 git subprocesses. Branch change latency dropped from 30 s p99 to ~430 ms. The remaining sweep cost is 10× smaller and only there as a belt-and-braces backup for `GitWatcher` overflow / error paths.

---

## Fix 1 — Event-driven `pull-requests` runtime ✅ landed

**Goal:** turn the unconditional 30s `syncWorkspaceBranches` polling into a `git:changed` subscription, so idle ticks cost ~0 git subprocesses regardless of worktree count.

### Changes

1. **Inject `GitWatcher` into `PullRequestRuntimeManager`** — extend `PullRequestRuntimeManagerOptions` with a `gitWatcher: GitWatcher` field. Wire it through `packages/host-service/src/app.ts:85+` where the runtime is constructed alongside the existing `GitWatcher`.

2. **Replace the polling timer in `start()`** (`packages/host-service/src/runtime/pull-requests/pull-requests.ts:218-230`):

   ```ts
   start() {
       if (this.unsubscribeFromGitWatcher) return;

       // One initial sweep so existing workspaces have correct branch/sha/upstream
       // even if no .git/ changes have happened since the last process start.
       void this.syncWorkspaceBranches();
       void this.refreshEligibleProjects();

       // Steady-state: react to real .git/ changes per workspace.
       this.unsubscribeFromGitWatcher = this.gitWatcher.onChanged((event) => {
           void this.syncOneWorkspace(event.workspaceId);
       });

       // Long-cadence safety net for events the watcher might miss
       // (overflow, fs.watch errors). 5 min, not 30 s.
       this.safetyNetTimer = setInterval(
           () => void this.syncWorkspaceBranches(),
           SAFETY_NET_INTERVAL_MS,
       );
   }
   ```

3. **Add `syncOneWorkspace(workspaceId)`** — the existing `syncWorkspaceBranches` loop body (lines 310–356) extracted to operate on a single workspace by id. Reuses every existing helper (`getCurrentBranchName`, `getHeadSha`, `resolveWorkspaceUpstream`).

4. **Drop `BRANCH_SYNC_INTERVAL_MS = 30_000`**, add `SAFETY_NET_INTERVAL_MS = 5 * 60_000`. The 30 s timer goes away.

5. **`stop()`** unsubscribes from the GitWatcher and clears the safety-net timer.

### Why this is safe

- `GitWatcher` already debounces `.git/` changes per workspace at 300 ms (`git-watcher.ts:12, 136-162`). Branch / HEAD / upstream changes always touch `.git/` (refs, HEAD pointer, config), so this catches everything `syncWorkspaceBranches` catches today, with **lower** latency (300 ms vs 30 s).
- The 5-min safety net handles the rare overflow/error path where `GitWatcher` resets a watcher and might miss an event.
- Initial `syncWorkspaceBranches` call on `start()` ensures workspaces created before the runtime started are caught up.

### Implementation notes (gotchas the next session will hit)

**App.ts wiring order.** `GitWatcher` must be **constructed and started before** `PullRequestRuntimeManager.start()`, otherwise the subscription registers but the watcher hasn't begun emitting yet. In `packages/host-service/src/app.ts` the existing flow constructs `GitWatcher` already (search for `new GitWatcher`); just thread the same instance into `PullRequestRuntimeManager` constructor options and call `gitWatcher.start()` first.

**Concurrency is already safe.** Multiple `git:changed` events for different workspaces will fire concurrent `syncOneWorkspace(workspaceId)` calls. Each calls `refreshProject(projectId)` if it detected a change. The existing `inFlightProjects` guard at `pull-requests.ts:384-388` already deduplicates concurrent refreshes for the same project. No new locking required.

**Workspace deleted between event fire and sync handler.** If a workspace is deleted while a `git:changed` event is in flight, the `syncOneWorkspace` lookup against the workspaces table returns nothing — early-return is the right behavior. Don't throw.

**`.git/config` changes.** Upstream resolution depends on `git config branch.X.merge` etc. `GitWatcher` watches `.git/` recursively (line 234), so config edits trigger `git:changed`. The `paths` field on `GitChangedEvent` will be absent (it's a `.git/*` event, see `git-watcher.ts:146-148`), but that's fine — we re-derive everything anyway.

**Debounce window.** `GitWatcher` debounces at 300 ms (`git-watcher.ts:12`). Real branch-change latency under the new design: ~300 ms, vs up-to-30s under polling. Net win.

**`syncWorkspaceBranches` stays.** Don't delete the existing method — extract `syncOneWorkspace(workspaceId)` and have `syncWorkspaceBranches` call it for each workspace. The full-sweep version is now used only for:
1. The one-time call from `start()` (initial state catch-up).
2. The 5-min safety-net interval (covers `GitWatcher` error/overflow paths).

### Verification

Each existing test/benchmark needs an update. Map of changes:

| File | Current behavior | Update |
|------|------------------|--------|
| `packages/host-service/test/pull-requests-scaling.test.ts` | unit test, mocks db + git, calls `syncWorkspaceBranches` directly. Asserts O(N) git ops per call. | KEEP AS-IS — the safety-net path still exists and still does O(N) when invoked. Rename the describe to clarify it tests "the safety-net sweep" rather than "the 30s tick." |
| `packages/host-service/test/integration/pull-requests-scaling.integration.test.ts` | "idle tick still issues git calls for every workspace" — asserts `totalAfterTwoTicks === firstTickCount * 2`. | ADD a new test for event-driven path: construct manager with a real `GitWatcher`, `start()` it, do `git commit` in one of N fixture repos, assert only that workspace's git-op counter incremented (the other N-1 stay at 0). KEEP the existing test — it now tests the safety-net sweep behavior. |
| `packages/host-service/test/integration/pull-requests-scaling.bench.test.ts` | measures wall-clock of `syncWorkspaceBranches` ticks. | REPLACE with a benchmark that measures event-to-DB-update latency for a single `git commit` event, plus the safety-net sweep cost. The "ms per polling tick" measurement no longer corresponds to runtime behavior. |
| `packages/host-service/test/pull-requests.test.ts` | existing pre-audit unit tests for `syncWorkspaceBranches`. | LIKELY UNCHANGED — they call `syncWorkspaceBranches` directly which still exists. Run to confirm. |

### New test for the event-driven path (sketch)

```ts
test("git:changed event triggers single-workspace sync, not full sweep", async () => {
    // 5 fixture repos, 5 workspaces seeded.
    const scenario = await createScalingScenario(5);

    // Wire a real GitWatcher against the test host's filesystem manager.
    const gitWatcher = new GitWatcher(scenario.host.db, scenario.host.runtime.filesystem);
    // ...inject into manager...
    scenario.manager.start();
    await waitFor(() => gitWatcher.isWatchingAll(scenario.workspaceIds));

    scenario.gitOpLog.length = 0;

    // Commit in workspace 2 only.
    await scenario.repos[2].commit("change");

    // Wait for debounce window (300ms) + a small buffer.
    await waitFor(() => scenario.gitOpLog.length > 0, { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 100));

    // Only workspace 2's worktreePath should appear in the log.
    const touched = new Set(scenario.gitOpLog.map((c) => c.worktreePath));
    expect(touched.size).toBe(1);
    expect(touched.has(scenario.repos[2].repoPath)).toBe(true);
});
```

### Target numbers

| Scenario | Before | After |
|----------|--------|-------|
| Idle tick @ N=20 worktrees | 1542 ms (80 git ops) | 0 ms (0 git ops) |
| Single branch change @ any N | ≤ 30 s wait + ~80 ms work | ~300 ms wait + ~80 ms work |
| Daily git subprocess count @ N=20 | ~230k | proportional to actual branch changes (~10s–100s/day) |

---

## Fix 2 — LRU + idle-TTL cap on `searchIndexCache` ✅ landed

**Goal:** bound JS heap growth by capping the number of cached worktree indexes and evicting idle entries.

### Changes

In `packages/workspace-fs/src/search.ts:100`:

```ts
const SEARCH_INDEX_CACHE_MAX = 12;
const SEARCH_INDEX_CACHE_TTL_MS = 30 * 60_000;

interface CachedIndex {
    items: SearchIndexEntry[];
    lastAccessedAt: number;
}

// Replace plain Map with an LRU + TTL.
const searchIndexCache = new Map<string, CachedIndex>();

function evictStaleEntries(): void {
    const now = Date.now();
    for (const [key, cached] of searchIndexCache) {
        if (now - cached.lastAccessedAt > SEARCH_INDEX_CACHE_TTL_MS) {
            searchIndexCache.delete(key);
        }
    }
}

function evictLruIfFull(): void {
    while (searchIndexCache.size >= SEARCH_INDEX_CACHE_MAX) {
        // Map iteration is insertion-order; LRU bump moves entries to the end
        // (delete + set). The first key in the Map is the least-recently-used.
        const oldestKey = searchIndexCache.keys().next().value;
        if (!oldestKey) break;
        searchIndexCache.delete(oldestKey);
    }
}
```

In `getSearchIndex` (lines 272–300):
- On hit, `delete` then re-`set` the entry to bump it to most-recently-used in insertion order, and update `lastAccessedAt`.
- On miss, after `buildSearchIndex` resolves, run `evictLruIfFull()` before inserting; opportunistically `evictStaleEntries()` too.

`patchSearchIndexesForRoot` and `invalidateSearchIndex*` need minor updates to read/write the `CachedIndex` shape.

### Why this is safe

- `patchSearchIndexesForRoot` from the file watcher keeps the active worktree's index current — no behavior change for active worktrees.
- After eviction, the next search for that worktree pays a fresh `fast-glob` walk (~50–200 ms for a 5k-file repo). That's acceptable cold-cost for a worktree the user hasn't searched in 30 minutes.
- `searchIndexBuilds` (line 101) already deduplicates concurrent builds; eviction can race with an in-flight build, but the deduplication map handles it.

### Verification

- **`search-cache-no-eviction.test.ts`** — flip the assertions: after building 13 indexes, the *first* one should NOT be `===` to its initial reference (it got evicted). The "100 newer worktrees" test should fail-as-designed. Update the test name to `search-cache-eviction.test.ts` and rewrite assertions.
- **`cache-and-paths-memory.bench.test.ts`** — re-run; heap delta at 130 worktrees should drop from ~6.87 MB to whatever 12 worktrees × ~53 KB ≈ 0.6 MB.

### Target numbers

| Scenario | Before | After |
|----------|--------|-------|
| Heap @ 130 cached indexes | +6.87 MB | +0.6 MB (only 12 retained) |
| Heap growth rate | linear in N | bounded by cap |
| Cold-search latency on evicted worktree | n/a | +50–200 ms |

---

## Fix 3 — LRU cap on per-watcher `pathTypes` ✅ landed

**Goal:** stop unbounded growth of `WatcherState.pathTypes` when worktrees see continuous unique-path creation (logs, hashed build artifacts).

### Changes

In `packages/workspace-fs/src/watch.ts:32-39, 472-484`:

```ts
const PATH_TYPES_MAX = 10_000;

interface WatcherState {
    // ...existing fields...
    pathTypes: Map<string, boolean>;
}

// In normalizeEvent (line 467-491):
if (event.type === "delete") {
    state.pathTypes.delete(absolutePath);
} else {
    try {
        const stats = await stat(absolutePath);
        isDirectory = stats.isDirectory();

        // LRU bump: re-insertion moves to most-recently-used position.
        state.pathTypes.delete(absolutePath);
        if (state.pathTypes.size >= PATH_TYPES_MAX) {
            const oldest = state.pathTypes.keys().next().value;
            if (oldest) state.pathTypes.delete(oldest);
        }
        state.pathTypes.set(absolutePath, isDirectory);
    } catch {
        isDirectory = state.pathTypes.get(absolutePath) ?? false;
    }
}
```

### Why this is safe

- `pathTypes` is a directory-type hint to avoid `stat()` on every event for the same path. Evicting an entry means the next event for that path falls into the existing `try { await stat() } catch` branch — i.e., the existing slow path, not a bug.
- The cap is per-watcher, so the worst case is one worktree thrashing its own cache while others are unaffected.

### Verification

- **`watch-pathtypes-growth.test.ts`** — the "30 unique paths" test still passes (30 < cap). Add a new test: create 10,001 unique paths and assert `pathTypes.size === 10_000` with the oldest entry evicted.
- **`cache-and-paths-memory.bench.test.ts`** — at 20k unique paths, heap should plateau at ~5 MB (10k entries × ~430 bytes) instead of climbing to ~9 MB.

### Target numbers

| Scenario | Before | After |
|----------|--------|-------|
| `pathTypes.size` after 20k unique paths | 20,000 | 10,000 (capped) |
| Heap @ 20k paths | +8.69 MB | +4.3 MB (capped) |
| Daily heap growth @ 20 active worktrees | ~85 MB/day | bounded ~85 MB total |

---

## Fix 4 — Loosen `refreshEligibleProjects` to 5-min safety net ✅ landed

**Goal:** drop the constant 20s ticking once Fix 1 makes branch changes event-driven.

### Changes

In `packages/host-service/src/runtime/pull-requests/pull-requests.ts:25-26`:

```ts
const PROJECT_REFRESH_INTERVAL_MS = 5 * 60_000; // was 20_000
```

Optionally, drop the timer entirely and rely on `refreshProject` calls from `syncOneWorkspace` (Fix 1) to keep the GraphQL cache warm. The 60s repo-PR cache (line 32) already absorbs duplicate fetches.

### Why this is safe

- Fix 1's event-driven `syncOneWorkspace` calls `refreshProject` whenever a branch change is detected, so PR state for active workspaces stays current without polling.
- The 5-min safety net catches PRs opened on GitHub without a corresponding local branch change (rare — the local fetch would trigger `git:changed`).

### Verification

- No new tests required. Existing `pull-requests.test.ts` integration tests should still pass.
- The host-service idle CPU profile should show no measurable activity in the runtime when no workspaces have `.git/` activity.

---

## Fix 5 — (Deferred) Lazy GitWatcher registration

After Fixes 1–3 land, re-measure idle host-service CPU and RSS at N=20 worktrees. If they're already flat, this fix is unnecessary — the per-watcher native cost is small in the absence of file events.

If they're not flat (e.g. background dev servers in many worktrees still cause measurable wakeups), revisit by:
- Adding a refcount to `GitWatcher.watchWorkspace` keyed on subscriber count.
- Generalizing the `bus.watchFs(workspaceId)` pattern from `apps/desktop/src/renderer/hooks/host-service/useWorkspaceEvent/useWorkspaceEvent.ts:73-83` to git events.
- BUT: the pull-requests runtime (post-Fix-1) is itself a subscriber to all workspaces' `git:changed`, so refcount-based laziness needs a way to skip the runtime's "always-on" subscription, or the runtime needs to subscribe lazily based on PR-tracked workspaces only.

This is a meaningful refactor; defer until measurements justify it.

---

## Sequencing & rollout

These fixes are internal to host-service / workspace-fs and don't touch the renderer or any tRPC contracts. No feature flags required. Land them as separate PRs in this order:

1. **Fix 2 + 3 first** (workspace-fs LRU caps) — small, isolated, no behavior change for active worktrees, easy to revert. Get the "memory creep stops" win quickly.
2. **Fix 1** (event-driven pull-requests) — bigger change, depends on `GitWatcher` already being constructed in `app.ts` (it is). Verify with the existing integration tests + a new "real branch change triggers single-workspace sync" test.
3. **Fix 4** — one-line change after #1 lands. Bundle with #1's PR if the integration test for #1 demonstrates the project refresh fan-out is no longer hot.

Each PR should re-run the corresponding benchmark from the findings doc and paste the before/after numbers in the description.

---

## Out of scope

- **Renderer-side `useDiffStats` fan-out** — already demoted to "boot/mount cost" in the findings audit. If sidebar-mount latency becomes a complaint, add a `git.getDiffStats` host endpoint that returns just `git diff --shortstat HEAD` per workspace, and switch `useDiffStats` to it. Separate effort.
- **`useChangesTab` / `useReviewTab` / `usePRFlowState` 10–30s `refetchInterval`s** — verified to fire only for the active workspace, not per-worktree. No change.

---

## Acceptance criteria

After Fixes 1–4 land:

- `pull-requests-scaling.integration.test.ts` retains the safety-net sweep coverage and adds a single-workspace event-driven sync case asserting that a commit in one of N worktrees only spawns git ops for that one worktree.
- `pull-requests-scaling.bench.test.ts` reports two metrics: (1) commit → DB-update latency (~430 ms at N=5), (2) safety-net sweep wall-clock at N ∈ {1, 5, 20}.
- `cache-and-paths-memory.bench.test.ts` reports plateau heap deltas (~2 MB cache cap, ~2.5 MB pathTypes cap) regardless of input size.
- Manual smoke: open 20 worktrees, leave the host-service idle for 10 minutes, verify CPU baseline is ≤ 1% and RSS is stable.
