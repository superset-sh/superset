# Renderer Memory Leak Analysis

Date: 2026-04-05
Scope: Superset Desktop renderer memory growth investigation for the report observed on 2026-04-02

## Original Report

- **Machine:** macOS, 24 GB RAM
- **App:** Superset Desktop v1.4.6, Electron-based
- **Uptime at observation:** ~36 hours
- **Renderer process:** 4.2 GB VSZ / 479 MB RSS / 148 min CPU time
- **System-wide pressure:** 21 GB / 24 GB used, 4.5 GB swap
- **Crash history:** 5 crash dumps within 7 minutes on Apr 1, suggesting OOM-kill + restart cycles

The VSZ-to-RSS ratio (4.2 GB vs 479 MB) indicates large amounts of allocated-but-paged-out memory, consistent with a growing JS heap. File descriptor count is normal (52 open FDs), ruling out an FD leak. This is unbounded memory allocation.

## Summary

Six distinct unbounded-growth paths were identified in the renderer process. They fall into two tiers:

1. **Two high-impact leaks** that together explain the reported memory and CPU profile:
   - `collectionsCache` in CollectionsProvider (app-wide, all authenticated sessions)
   - `workspaceClientsCache` in WorkspaceClientProvider (v2 workspace routes only)

2. **Four smaller lifetime accumulators** that are real but too small on their own to cause the reported profile:
   - `settledByIdempotency` in agent session orchestrator
   - `handledCommandsRef` in useCommandWatcher
   - `clientCache` in host-service-client
   - mediaQuery listener in theme store

## Findings

### P1: collectionsCache (CollectionsProvider) — Highest Impact

**Files:**

- `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts` (line 110)
- `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx` (lines 39-56)
- `apps/desktop/src/renderer/routes/_authenticated/layout.tsx` (line 183)

**The leak:**

```typescript
// collections.ts:110 — module-level Map, entries never deleted
const collectionsCache = new Map<string, OrgCollections>();
```

`CollectionsProvider` wraps the entire authenticated app shell (`layout.tsx:183`). It is mounted for the full duration of the user's authenticated session and is never unmounted during normal usage.

When an org is activated or switched, `preloadCollections(organizationId)` is called (`CollectionsProvider.tsx:46` and `CollectionsProvider.tsx:54-56`). This calls `getCollections(organizationId)` which creates a new `OrgCollections` bundle if one doesn't exist for that org, then caches it in `collectionsCache`:

```typescript
// collections.ts:557-574
export function getCollections(organizationId: string) {
    const cacheKey = getCollectionsCacheKey(organizationId);
    if (!collectionsCache.has(cacheKey)) {
        collectionsCache.set(cacheKey, createOrgCollections(organizationId));
    }
    // ...
}
```

Each `OrgCollections` bundle created by `createOrgCollections()` (lines 150-532) contains:

- **19 Electric-backed collections**, each with its own ShapeStream sync connection: tasks, taskStatuses, projects, v2Devices, v2Projects, v2UsersDevices, v2Workspaces, workspaces, members, users, invitations, agentCommands, integrationConnections, subscriptions, apiKeys, chatSessions, sessionHosts, githubRepositories, githubPullRequests
- **3 localStorage-backed collections**: v2SidebarProjects, v2WorkspaceLocalState, v2SidebarSections
- **1 shared global collection**: organizations

`preloadCollections()` (lines 539-550) then calls `.preload()` on each collection, which starts the Electric ShapeStream sync process. Data is written into collection state even when no React component subscribes via `useLiveQuery()`.

**Why entries are never cleaned up:**

There is no call to `collectionsCache.delete()` anywhere in the codebase. The `switchOrganization()` callback (`CollectionsProvider.tsx:39-52`) preloads the new org's collections but does not remove or clean up the old org's entry.

TanStack DB has built-in GC: when `activeSubscribersCount` drops to 0, a 5-minute timer starts, and if still at 0 when it fires, the collection calls `sync.cleanup()` which unsubscribes the ShapeStream. However, the `collectionsCache` Map holds strong references to all collection instances, so even if individual collections GC their sync state, the Map entries (and the collection objects themselves) remain in memory. If any collection is accessed again before the 5-minute window, the GC timer is cancelled.

**Growth pattern:**

Each unique org visited adds ~19 active ShapeStream sync connections plus all their preloaded row data to the cache. Even a single org that's never switched can keep many preloaded collections alive that the current screen never uses.

For org switching: User opens Org A (24 collections created, 19 streams syncing). User switches to Org B (24 more collections, 19 more streams). Old Org A entry stays in cache with its data. Repeat for C, D, E — cache grows linearly with unique orgs.

**Why this is the strongest match for the report:**

The 148 minutes of CPU time over 36 hours indicates active churning, not idle bloat. Active ShapeStream sync processing across all cached orgs explains sustained CPU usage. The 19 streams per org, each receiving and processing change messages, would produce exactly this pattern. The memory growth from accumulating synced row data across multiple orgs explains the VSZ expansion.

---

### P2: workspaceClientsCache (WorkspaceClientProvider) — High Impact, v2-Only

**Files:**

- `packages/workspace-client/src/providers/WorkspaceClientProvider/WorkspaceClientProvider.tsx` (line 47)
- `packages/workspace-client/src/lib/workspaceFsEventRegistry.ts` (line 17)
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/layout.tsx` (line 100)

**The leak:**

```typescript
// WorkspaceClientProvider.tsx:47 — module-level Map, entries never deleted
const workspaceClientsCache = new Map<string, WorkspaceClients>();
```

Each entry contains a `QueryClient` (configured with 30-minute gcTime per query), a tRPC client with `httpBatchLink`, and WebSocket subscription factory functions.

In the v2 workspace layout (`layout.tsx:97-106`), the provider is keyed by `${workspace.id}:${hostUrl}`:

```tsx
<WorkspaceTrpcProvider
    cacheKey={workspace.id}
    key={`${workspace.id}:${hostUrl}`}
    hostUrl={hostUrl}
    // ...
>
```

When the user switches workspaces, React unmounts the old provider (due to key change) and mounts a new one. The `getWorkspaceClients()` function (lines 183-226) creates a new cache entry with `workspaceClientsCache.set(clientKey, clients)`, but there is no `useEffect` cleanup on unmount to remove the entry.

The `workspaceFsEventRegistry` (`workspaceFsEventRegistry.ts:17`) has a separate `subscriptions` Map with proper ref-counted cleanup via `removeSubscriptionIfInactive()` (lines 47-57). This cleanup relies on all consumers (hooks using `useEffect` returns) properly unsubscribing. React's unmount cleanup should trigger this. However, the workspace clients cache itself is never cleaned, so `QueryClient` instances with their cached query results, and tRPC client instances, accumulate.

**Growth pattern:**

Linear with unique workspaces visited. Each entry is smaller than a collections bundle, but `QueryClient` caches accumulate query results over time (staleTime 5 seconds, gcTime 30 minutes per query). Over 36 hours of workspace switching, many abandoned `QueryClient` instances hold megabytes of cached data.

**Scope:** Only affects v2 workspace routes. Users who don't use v2 workspaces are not affected by this leak.

---

### P3: settledByIdempotency (Agent Session Orchestrator) — Low-Medium Impact

**File:**

- `apps/desktop/src/renderer/lib/agent-session-orchestrator/agent-session-orchestrator.ts` (line 18)

**The leak:**

```typescript
// Line 17 — properly cleaned, entries deleted after settlement
const inFlightByIdempotency = new Map<string, Promise<AgentLaunchResult>>();
// Line 18 — NEVER cleaned, entries accumulate indefinitely
const settledByIdempotency = new Map<string, AgentLaunchResult>();
```

After each agent session resolves, the result is moved from `inFlightByIdempotency` (which properly deletes entries at line 187) to `settledByIdempotency` (line 188). The settled map is used for deduplication — if the same idempotency key is used again, the cached result is returned (line 114-117). But entries are never evicted.

Each `AgentLaunchResult` is ~200 bytes (workspaceId, tabId, paneId, sessionId, status, error). Keys are `${workspaceId}:${idempotencyKey}` (~64-100 bytes).

**Growth estimate:** At 10 agent sessions/hour, this accumulates ~72 KB over 36 hours. Becomes significant over months (~86 MB/year at heavy usage). Not a contributor to the current report's 4.2 GB profile.

Note: `buildIdempotencyKey()` returns `null` if `request.idempotencyKey` is not set. Common task-launch flows may not set idempotency keys, which would reduce actual accumulation.

---

### P4: handledCommandsRef (useCommandWatcher) — Low Impact

**File:**

- `apps/desktop/src/renderer/routes/_authenticated/components/AgentHooks/hooks/useCommandWatcher/useCommandWatcher.ts` (lines 28-32)

**The leak:**

```typescript
const handledCommandsRef = useRef(new Set<string>());       // line 28 — UNBOUNDED
const processingCommandsRef = useRef(new Set<string>());     // line 29 — bounded (concurrent)
const persistingCommandsRef = useRef(new Set<string>());     // line 30 — bounded (concurrent)
const pendingPersistenceRef = useRef(new Map<string, ResolvedCommandState>()); // line 31 — partially unbounded
const persistenceRetryTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>()); // line 32 — bounded
```

`handledCommandsRef` is a `Set<string>` of all command UUIDs ever processed during the session. Entries are added (line 240) and never removed. This is mounted via `AgentHooks` in the authenticated layout, so it lives for the entire session.

`pendingPersistenceRef` holds commands waiting for DB persistence. Entries are added on command resolution (line 241) and deleted after successful persistence (line 143). If persistence fails repeatedly, entries can accumulate.

**Growth estimate:** At ~36 bytes per UUID, ~7.5 commands/hour, this accumulates ~10 KB over 36 hours. Negligible.

---

### P5: clientCache (host-service-client) — Low Impact

**File:**

- `apps/desktop/src/renderer/lib/host-service-client.ts` (line 6)

**The leak:**

```typescript
const clientCache = new Map<string, ReturnType<typeof createTRPCClient<AppRouter>>>();
```

Keyed by host URL. `getHostServiceClientByUrl()` creates a tRPC client per URL and caches it. No deletion path exists. Each tRPC client with `httpBatchLink` is ~50-100 KB.

The related `secrets` map in `host-service-auth.ts` does have a `removeHostServiceSecret()` function and is properly managed.

**Growth estimate:** Realistically 1-3 entries for most users (one per local host service instance). ~100-300 KB total. Only grows if the host service port changes repeatedly (e.g., frequent restarts during development).

---

### P6: mediaQuery Listener (Theme Store) — Negligible

**File:**

- `apps/desktop/src/renderer/stores/theme/store.ts` (line 397)

**The issue:**

`initializeTheme()` adds a `matchMedia("prefers-color-scheme: dark")` event listener without tracking or removing the previous one:

```typescript
// Line 385-398
if (typeof window !== "undefined") {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => { /* ... */ };
    mediaQuery.addEventListener("change", handleChange);
    // No removal of previous listener
}
```

In practice, the zustand store is a module-level singleton and `onRehydrateStorage` fires once per hydration. So this adds exactly one listener per app lifecycle. This is a correctness issue (should guard against duplicate registration) but not a contributor to the reported memory growth.

---

## Impact Summary

| Priority | Source | Location | Scope | 36h Growth | CPU Impact | Fix Complexity |
|----------|--------|----------|-------|------------|------------|----------------|
| **P1** | `collectionsCache` | CollectionsProvider/collections.ts:110 | All authenticated | High (19 ShapeStreams x orgs) | High (active sync) | Medium |
| **P2** | `workspaceClientsCache` | WorkspaceClientProvider.tsx:47 | v2 workspaces | Medium (QueryClient + tRPC per workspace) | Low | Low |
| **P3** | `settledByIdempotency` | agent-session-orchestrator.ts:18 | Agent sessions | Low (~72 KB) | None | Trivial |
| **P4** | `handledCommandsRef` | useCommandWatcher.ts:28 | Command watcher | Low (~10 KB) | None | Trivial |
| **P5** | `clientCache` | host-service-client.ts:6 | Host service | Low (~100-300 KB) | None | Trivial |
| **P6** | mediaQuery listener | theme/store.ts:397 | Theme store | Negligible | None | Trivial |

## Conclusion

The `collectionsCache` (P1) is the strongest explanation for both the memory footprint and the sustained CPU time observed in the report. It is mounted for the entire authenticated session, eagerly preloads 19 Electric sync streams per org, and never evicts entries. The active background sync processing across all cached orgs matches the 148-minute CPU time signature.

The `workspaceClientsCache` (P2) compounds the problem for users navigating between v2 workspaces, adding abandoned `QueryClient` instances with their cached query results.

P3-P6 are real unbounded accumulators that should be fixed for long-term health, but they are too small to cause the reported 4.2 GB / 148 min profile on their own.

## Recommended Fix Order

1. Add eviction to `collectionsCache` so old org entries are cleaned up after the user switches away. Ensure ShapeStream sync connections are terminated for evicted entries.
2. Add retain/release lifecycle to `workspaceClientsCache` so cached workspace clients are disposed when the last consumer unmounts (with a grace period to avoid thrashing on quick re-mounts).
3. Add TTL or LRU eviction to `settledByIdempotency`.
4. Periodically prune `handledCommandsRef` (e.g., keep only last N entries or entries from last hour).
5. Add eviction to host-service `clientCache` when host URLs become stale.
6. Guard `initializeTheme()` against duplicate mediaQuery listener registration.

## Recommended Validation

After fixes are implemented:

1. Measure renderer heap after repeated org switching (P1 validation).
2. Measure renderer heap after repeated v2 workspace navigation (P2 validation).
3. Measure renderer heap after long authenticated idle time without switching views (baseline).
4. Capture heap snapshots to confirm old org collections and workspace query clients are no longer retained.
5. Monitor CPU time over 24+ hours to confirm background sync churning is eliminated for inactive orgs.
