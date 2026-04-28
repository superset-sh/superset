# Implementation details
For Electron interprocess communication, ALWAYS use trpc as defined in `src/lib/trpc`
Please use alias as defined in `tsconfig.json` when possible

## tRPC Subscriptions (trpc-electron)

**Important:** While standard tRPC recommends async generators for subscriptions, `trpc-electron` (used for Electron IPC) **only supports observables**. The library explicitly checks `isObservable(result)` and throws an error otherwise. Use the `observable` pattern:

```typescript
// CORRECT for trpc-electron - use observable pattern
import { observable } from "@trpc/server/observable";

export const createMyRouter = () => {
  return router({
    subscribe: publicProcedure.subscription(() => {
      return observable<MyEvent>((emit) => {
        const handler = (data: MyData) => {
          emit.next({ type: "my-event", data });
        };

        myEmitter.on("my-event", handler);

        return () => {
          myEmitter.off("my-event", handler);
        };
      });
    }),
  });
};

// WRONG for trpc-electron - async generators don't work with IPC transport
export const createMyRouter = () => {
  return router({
    subscribe: publicProcedure.subscription(async function* () {
      // This will NOT work - the generator never gets invoked
      while (true) {
        yield await getNextEvent();
      }
    }),
  });
};
```

## TanStack DB persistence

Synced collections in `src/renderer/.../CollectionsProvider/collections.ts` are persisted to SQLite at `~/.superset/tanstack-db.sqlite` via `@tanstack/electron-db-sqlite-persistence`. Local cache survives cold start so the app's core shell renders offline.

- **Synced collections** use `createPersistedElectricCollection(electricCollectionOptions<T>(...))`. The helper wraps with `persistedCollectionOptions` + `schemaVersion: 1` + adds index defaults.
- **Local-only collections** (sidebar layout, terminal presets, user preferences, etc.) stay on `localStorageCollectionOptions` via `createIndexedCollection(...)`. They were already offline-capable; migrating them to SQLite is a separate effort with data-migration risk (Date round-trip, base64 payloads, opaque deep objects).
- **Schema evolution:** prefer additive Zod changes (`.optional().default(...)`) — no `schemaVersion` bump. Only bump `schemaVersion` for breaking changes (rename, type change, `getKey` change). Bumping a synced collection clears its local cache and triggers a fresh Electric pull (server is canonical, no data loss). Bumping a local-only collection throws unless paired with an explicit migration hook.
- **Migration hooks** for future local-only schema changes: place under `routes/_authenticated/hooks/useMigrate*/`, mount from `CollectionsProvider`, follow the `useMigrateV1PresetsToV2` template (read old, transform, write new, set sentinel for idempotency).
- **Data isolation:** each collection's id is org-scoped (e.g. `tasks-${organizationId}`), so SQLite tables don't collide across orgs. The DB file is machine-wide (matches `~/.superset/local.db`); not cleared on sign-out.