# Local-First Sync Plan

## Current State

- **Read path**: Electric SQL syncs server → PGlite (working)
- **Write path**: Direct tRPC API calls from renderer (working, but no offline support)

## Proposed: Zustand Pending-Writes Pattern

Simple offline queue with optimistic local updates.

### Architecture

```
User action
    ↓
PGlite (optimistic write)
    ↓
Zustand pending-writes queue (persisted to localStorage)
    ↓
Sync worker (processes queue, retries on failure)
    ↓
tRPC API
    ↓
Database
    ↓
Electric syncs canonical state back to PGlite
```

### Implementation (~150 lines)

1. **`stores/pending-writes/store.ts`** - Zustand store with localStorage persistence
2. **`stores/pending-writes/sync-worker.ts`** - Background processor with exponential backoff
3. **`stores/pending-writes/hooks.ts`** - `useOptimisticTask()` etc.

### API Requirements

- [x] Accept client-generated UUIDs for creates
- [x] Partial updates (PATCH style, only changed fields)
- [x] Idempotent operations (retries are safe)
- [ ] Optional: Client timestamps for explicit LWW conflict resolution

### Alternatives Considered

| Approach | Pros | Cons |
|----------|------|------|
| **Zustand pending-writes** | Simple, ~150 LOC, works with existing stack | Manual wiring per entity |
| **Legend State v3** | Built-in sync engine, retries, offline | Beta, new dependency, learning curve |
| **Through-the-DB (SQL triggers)** | Pure SQL, no JS sync code | Complex schema, harder to debug |
| **Electric Pattern 3** | Well-documented | Adds Valtio dependency |

### Effort

- Basic implementation: 1 day
- Add entity: ~15 min each

## Decision

Ship without offline sync for now. Current API writes work fine.
Revisit when offline support becomes a priority.
