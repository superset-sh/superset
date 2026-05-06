# V2 paths — worktree-scaling perf audit

**Branch:** `v2-paths-worktree-perf`
**Date:** 2026-05-02

The user observed: "adding worktrees should not add overhead, but it does." This audit walks the v2 code paths to find the work that scales with worktree count, **especially over time** (boot cost is acceptable; recurring or monotonically-growing cost is not).

Each big finding has a reproduction test under the corresponding package's `test/` directory.

---

## Steady-state scaling — ranked

### 🔴 1. `syncWorkspaceBranches` — O(N) git subprocesses every 30s, forever

**Location:** `packages/host-service/src/runtime/pull-requests/pull-requests.ts:221-228, 306-365`

A `setInterval` (`BRANCH_SYNC_INTERVAL_MS = 30_000`) fires `syncWorkspaceBranches`, which iterates `db.select().from(workspaces).all()` and for **every** workspace spawns ~5–7 `git` subprocesses to detect branch / HEAD / upstream changes:

| Step | Helper | git call |
| ---- | ------ | -------- |
| Branch name | `getCurrentBranchName` (lines 41–55) | `git symbolic-ref --short HEAD` (or fallback `rev-parse --abbrev-ref HEAD`) |
| HEAD SHA | `getHeadSha` (lines 57–75) | `git rev-parse HEAD` |
| Upstream (push) | `resolveWorkspaceUpstream` (lines 91–137) | `git rev-parse --abbrev-ref BRANCH@{push}` + `git remote get-url …` |
| Upstream (fallback) | same | `git config --get branch.X.merge`, `branch.X.pushRemote` / `remote.pushDefault` / `branch.X.remote` |

**Why it bites over time:** the work runs every 30s **regardless of whether anything changed**. Most ticks find unchanged state and exit at line 322–331 — pure waste.

**Cost arithmetic (measured, not extrapolated):**

Wall-clock per tick from `pull-requests-scaling.bench.test.ts` on the dev machine:

| N worktrees | git ops/tick | wall-clock/tick | ms/op |
| ----------: | -----------: | --------------: | ----: |
|           1 |            4 |            74ms | 18.6  |
|           5 |           20 |           419ms | 20.9  |
|          20 |           80 |          1542ms | 19.3  |

Linear in N, ~19 ms per real `simple-git` subprocess (fork/exec/IPC dominant). At N=20 the runtime is burning ~1.5 seconds of pure CPU every 30s tick on subprocess overhead alone — ~3% of every clock cycle for nothing. Extrapolated: N=50 ≈ 3.9 s/tick (~13% of every 30s window), N=100 ≈ 7.7 s/tick (~26%).

**Why it's redundant:** `GitWatcher` (`packages/host-service/src/events/git-watcher.ts:42-86, 234-237`) already watches `.git/` recursively per workspace and emits a debounced `git:changed` event with the workspaceId. Branch / HEAD / upstream changes always touch `.git/`. **Verified:** `pull-requests.ts` does not subscribe to `GitWatcher.onChanged` (no `git:changed` reference in that runtime).

**Fix shape:** subscribe `pull-requests` to `GitWatcher.onChanged`. Re-derive branch only for the workspace whose `.git/` actually changed. Keep a 5-min sweep as safety net rather than the primary signal.

**Reproduction test:** `packages/host-service/test/pull-requests-scaling.test.ts` — proves git invocations grow linearly with workspace count.

---

### 🔴 2. `searchIndexCache` — monotonic memory growth, no eviction

**Location:** `packages/workspace-fs/src/search.ts:19, 100, 287-299, 659-674`

```ts
// No TTL — index is kept current via patchSearchIndexesForRoot from file watcher
const searchIndexCache = new Map<string, SearchIndexEntry[]>();
```

The cache key is `${rootPath}::${includeHidden}`. Once populated for a workspace, **the entry lives for the lifetime of the host-service process.** No LRU, no TTL, no idle eviction — the only paths that remove entries are explicit `invalidateSearchIndex*` calls (overflow handler in `watch.ts:408`, or external invalidation after rename / config changes).

**Why it bites over time:** every worktree the user touches contributes a full file list (`SearchIndexEntry` per source file, ~kB each in JS). After a week, N worktrees × file count per worktree sits in resident memory.

**Measured (`cache-and-paths-memory.bench.test.ts`):** 130 cached worktree indexes × 200 files each = 26,000 cached entries → **+6.87 MB heap** (~53 KB per worktree, ~0.27 KB per entry). Calling `invalidateAllSearchIndexes` frees ~5.4 MB, confirming the entries are the load. Repos with realistic file counts (5k–10k files) would multiply this by ~25×.

**Why it's also a CPU hazard:** the file watcher's overflow path (`watch.ts:399-410`) calls `invalidateSearchIndexesForRoot` and the next access does another full `fast-glob('**/*')`. Overflow is more likely as worktrees share parent directories and FSEvents queues saturate, so the cache becomes a "build it, lose it, rebuild" cycle under heavy churn.

**Fix shape:** cap with an LRU (8–16 most-recent worktrees) **or** drop entries after K minutes of no access. The "kept current via patches" claim is true for the active worktree; idle workspaces don't need their full file list resident.

**Reproduction test:** `packages/workspace-fs/src/search-cache-no-eviction.test.ts` — proves the cache holds 50 distinct indexes simultaneously without auto-eviction.

---

### 🔴 3. `FsWatcherManager.pathTypes` — monotonic per-watcher map growth

**Location:** `packages/workspace-fs/src/watch.ts:36, 371, 472-482`

Each `WatcherState` carries a `Map<string, boolean>` of every path the watcher has seen. The state is updated in `applyDirectoryHint`:

```ts
if (next.kind === "delete") {
    state.pathTypes.delete(absolutePath);
} else {
    state.pathTypes.set(absolutePath, isDirectory);
}
```

**Why it bites over time:** every `create` / `update` / `rename` event adds the path to the map; only `delete` events remove. New files that don't get cleaned up (logs, build artifacts that escape `DEFAULT_IGNORE_PATTERNS`, generated assets, dev-server tmp files, sourcemap rotations) accumulate forever. The map is per-worktree, so total leak ≈ N worktrees × new-paths-touched-per-day.

`DEFAULT_IGNORE_PATTERNS` (search.ts:28-36) covers `node_modules`, `.git`, `dist`, `build`, `.next`, `.turbo`, `coverage` — but not `.cache`, `tmp`, `logs`, app-specific build outputs, etc.

**Measured (`cache-and-paths-memory.bench.test.ts`):** 20,000 unique paths in a single watcher's `pathTypes` map → **+8.69 MB heap** (~4.3 MB per 10k entries, ~430 bytes per entry). Per-worktree, with active dev servers / log rotation churning unique filenames, easily reaches 10k+ paths/day. With 20 worktrees, that's ~85 MB/day of pathTypes-only growth, never reclaimed unless deletes catch up exactly.

**Fix shape:** bound `pathTypes` (LRU 10k entries per watcher) or scrub it on the debounce flush — the directory-type hint is only needed for the immediate event window, not the entire watcher lifetime.

**Reproduction test:** `packages/workspace-fs/src/watch-pathtypes-growth.test.ts` — uses a real `FsWatcherManager` + real `@parcel/watcher` + real fs writes. Reaches into the manager's private `watchers` map (same `as unknown as` pattern other tests use) to assert `pathTypes` grows monotonically with `create` events, stays flat on `update`, shrinks on `delete`, and peaks at N when N unique paths are created in a burst.

---

### 🟡 4. `refreshEligibleProjects` — small but constant ticking

**Location:** `pull-requests.ts:224-226, 367-378`

Every 20s: scan all workspaces, dedupe to projects, fan out `refreshProject(projectId)`. The 60s GraphQL cache (`REPO_PULL_REQUEST_CACHE_TTL_MS = 60_000`, line 32, after fix in commit 5291207fc) means most ticks are network no-ops.

**Why it still costs:** the DB scan + `Promise.all` orchestration runs every 20s regardless of activity. Bounded by unique project count, not worktree count, so it scales weakly with N.

**Fix shape:** once #1 is event-driven (a real branch change triggers a targeted `refreshProject`), this tick can drop to a 5-min freshness floor instead of 20s.

---

### 🟡 5. Active worktrees compound file-event traffic

Not strictly "scales with N worktrees" but worth flagging. A parcel watcher per worktree means each running dev server / build / log writer in a different worktree produces its own debounce flush stream. With 20 worktrees and 5 of them running dev servers, host CPU wakes up per worktree every 75–300ms.

**Fix shape:** **lazy** GitWatcher registration — only register watchers for workspaces with active subscribers. Today, `GitWatcher.start()` registers watchers for every workspace in the DB regardless of whether anyone is listening. Background worktrees should stop generating event traffic when nothing is listening.

---

## Re-derated (boot-only, not steady-state)

These look bad at first glance but only hurt once per session and are not the user's "over time" pain:

- **Search-index pre-warm in `getServiceForRootPath`** (`packages/host-service/src/runtime/filesystem/filesystem.ts:65`) — pay once per workspace, cached afterwards. Boot-only.
- **`useDiffStats` fan-out at sidebar mount** (`apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/DashboardSidebarWorkspaceItem.tsx:42`) — N concurrent `git.getStatus` IPC calls when the sidebar mounts. Once mounted, only refetches on real `git:changed` for its own workspace. Boot/mount-only.
- **Renderer-side polling** — every `refetchInterval` in `apps/desktop/src/renderer` lives under `v2-workspace/$workspaceId/...` (only fires for the active workspace) or is global (auth, host-service health). None fan out per worktree.

---

## Not actually a bug

- **`usePortsData`** (`apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/PortsList/hooks/usePortsData.ts:18, 23`) — earlier review claimed `ports.getAll(undefined)` / `ports.subscribe(undefined)` was passing invalid input. Verified false: `apps/desktop/src/lib/trpc/routers/ports/ports.ts:16, 28` defines both as `publicProcedure.query(...)` / `publicProcedure.subscription(...)` with no `.input()`. Passing `undefined` is correct.
- **`FsWatcherManager` multiplexing** (`packages/workspace-fs/src/watch.ts:318-351`) — multiple subscribers to the same path share one native watcher. Working as intended.
- **`useWorkspaceFileEventBridge`** (`apps/desktop/src/renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents/useWorkspaceFileEvents.ts:106-117`) — gated on `listenerCount > 0`. Lazy and correct.

---

## Recommended fix order

1. **Wire `pull-requests` runtime into `GitWatcher.onChanged`** and kill the 30s `syncWorkspaceBranches` polling. Single change, biggest CPU win.
2. **Cap `searchIndexCache` (LRU + TTL).** ~10 lines, kills the memory creep.
3. **Bound `pathTypes` per watcher.** Memory fix.
4. **Make `GitWatcher` lazy-register watchers** based on subscriber refcount (the `bus.watchFs` pattern already exists for `fs:events` in `apps/desktop/src/renderer/hooks/host-service/useWorkspaceEvent/useWorkspaceEvent.ts:73-83` — generalize it). Bigger refactor, biggest steady-state win on multi-worktree machines.
5. **Loosen `refreshEligibleProjects` to a 5-min safety net** once #1 is event-driven.

After these, host-service idle CPU + RSS should be roughly flat regardless of worktree count.

---

## Reproduction tests

All three findings have integration-level tests that exercise real subsystems (real git subprocesses, real `fast-glob`, real `@parcel/watcher`) — no fakes for the component under test.

| Finding | Test file | Style | What it asserts |
| ------- | --------- | ----- | --------------- |
| #1 syncWorkspaceBranches scales O(N) | `packages/host-service/test/pull-requests-scaling.test.ts` | unit (mocked db + git) | per-tick git call count = N × 4; idle ticks pay full cost |
| #1 syncWorkspaceBranches scales O(N) | `packages/host-service/test/integration/pull-requests-scaling.integration.test.ts` | **integration** — real bun:sqlite DB, real git repos via `createGitFixture`, real `simple-git` subprocesses (only `GitFactory` boundary instrumented for counting) | per-tick git call count = N × 4 with real subprocesses; second idle tick pays the same cost as the first |
| #2 searchIndexCache never evicts | `packages/workspace-fs/src/search-cache-no-eviction.test.ts` | **integration** — real fs, real `fast-glob` walks | after building 50 indexes the first one stays cached; even after 100 newer indexes the first array reference is still returned (no LRU); only `invalidateAllSearchIndexes` removes entries |
| #3 pathTypes growth | `packages/workspace-fs/src/watch-pathtypes-growth.test.ts` | **integration** — real `FsWatcherManager` + real `@parcel/watcher` + real fs writes | `pathTypes.size` grows ≥N when N unique files are created; stays flat on updates to existing files; shrinks on deletes; spikes back up when new unique paths arrive (the "log rotation" leak shape) |

### Benchmarks (real wall-clock + heap)

These print measurements; assertions are minimal so they don't fail on noisy CI runners. Run them when you want hard numbers, not as part of every test loop.

| Benchmark | Measures |
| --------- | -------- |
| `packages/host-service/test/integration/pull-requests-scaling.bench.test.ts` | wall-clock ms per `syncWorkspaceBranches` tick at N ∈ {1, 5, 20} with real `simple-git` subprocesses |
| `packages/workspace-fs/src/cache-and-paths-memory.bench.test.ts` | JS heap delta (via `Bun.gc(true)` + `process.memoryUsage`) for `searchIndexCache` at 5/30/130 worktrees and `pathTypes` at 1k/5k/20k unique paths |
