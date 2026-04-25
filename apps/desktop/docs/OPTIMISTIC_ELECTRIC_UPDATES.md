# Optimistic Electric Updates

Desktop uses TanStack DB collections backed by Electric shapes for task and workspace data. The default write model is **optimistic online**, not offline-first.

## Decision

Use TanStack DB collection mutations for routine server-backed writes that already have stable local identity:

1. The UI calls `collection.insert`, `collection.update`, or `collection.delete`.
2. TanStack DB applies optimistic state immediately.
3. The collection handler persists through our API.
4. The API returns the PostgreSQL `txid` from the same database transaction as the write.
5. Electric streams that transaction back to the client.
6. TanStack DB drops the optimistic overlay or rolls it back if persistence fails.

This matches the documented TanStack DB mutation lifecycle and Electric collection txid strategy:

- TanStack DB mutations: https://tanstack.com/db/latest/docs/guides/mutations
- Electric collection txid matching: https://tanstack.com/db/latest/docs/collections/electric-collection

## Scope

Optimistic online is the right default for task edits, status changes, assignment changes, priority changes, title/description edits, and soft deletes. These are simple, single-record writes where immediate feedback matters and rollback is acceptable if the server rejects the write.

New task creation can remain server-confirmed while it relies on server-generated slugs, default status seeding, and navigation to the canonical record. Move creation to optimistic insert only after the client can provide all stable identity and routing fields up front.

Do not treat this as offline-first. If the API call cannot run, the transaction should fail, TanStack DB should roll back the optimistic state, and the UI should show a failure toast. We are not adding a durable outbox, replay queue, conflict resolver, or persisted collection state in this pass.

## Desktop Collection Matrix

Desktop currently has three write categories.

### Server-backed Electric writes

These collections have Electric mutation handlers in `CollectionsProvider/collections.ts`:

| Collection | Handlers | Current write surface | Behavior |
| --- | --- | --- | --- |
| `tasks` | insert, update, delete | `useOptimisticCollectionActions().tasks` for update/delete; create dialog still uses `task.createFromUi` directly | Optimistic for task edits/deletes; collection handlers return `{ txid }`. |
| `v2Projects` | update | `useOptimisticCollectionActions().v2Projects` for rename/repository updates | Optimistic for project row edits; create/delete remain API-confirmed. |
| `v2Workspaces` | update | `useOptimisticCollectionActions().v2Workspaces` for rename-style updates | Optimistic for workspace row edits; create/delete remain host-service sagas. |
| `chatSessions` | delete | `useOptimisticCollectionActions().chatSessions` for chat session deletion | Optimistic delete; create remains server-confirmed because the chat runtime coordinates session creation. |
| `agentCommands` | update | `useCommandWatcher` | Background optimistic update; caller awaits `tx.isPersisted.promise` and retries on failure. |

### Read-only Electric collections

These are Electric-backed in the renderer but have no collection mutation handlers and no direct renderer `collection.insert/update/delete` calls:

- `organizations`
- `taskStatuses`
- `projects`
- `v2Hosts`
- `v2Clients`
- `v2UsersHosts`
- `workspaces`
- `members`
- `users`
- `invitations`
- `integrationConnections`
- `subscriptions`
- `apiKeys`
- `sessionHosts`
- `githubRepositories`
- `githubPullRequests`
- `automations`
- `automationRuns`

Workspace create/delete flows do not use `collections.v2Workspaces.insert/delete`. They go through host-service or tRPC APIs and then Electric streams the confirmed row back:

- workspace create/checkout/adopt writes a local `pendingWorkspaces` row, then the pending page calls host-service
- workspace delete calls host-service `workspaceCleanup.destroy`; the sidebar hides the row through `DeletingWorkspacesProvider` while the saga runs

Workspace rename does use `collections.v2Workspaces.update` via `useOptimisticCollectionActions().v2Workspaces`, backed by `v2Workspace.update` returning `{ txid }` from the same Postgres transaction.

### LocalStorage collections

These are client-local TanStack DB collections. They are synchronous local persistence, not Electric/Postgres optimistic writes:

- `v2SidebarProjects` — sidebar project order/collapse/default app
- `v2WorkspaceLocalState` — sidebar placement, pane layout, viewed files, changes tab
- `v2SidebarSections` — user-created sidebar sections and ordering
- `v2TerminalPresets` — local terminal presets
- `pendingWorkspaces` — durable local bus for workspace creation progress and launch handoff
- `v2UserPreferences` — local v2 preferences such as link behavior and delete-branch default

LocalStorage mutations can still throw for schema/storage errors, but they do not have remote persistence confirmation or Electric rollback semantics.

## Implementation Contract

Collection handlers must return `{ txid }` for server-backed Electric writes. The txid must come from `pg_current_xact_id()` inside the same transaction that performs the mutation. A txid captured before or after the write can leave `tx.isPersisted.promise` waiting for a transaction that Electric will never stream.

Feature code should not scatter direct server-backed collection mutations. Use `useOptimisticCollectionActions` and the relevant grouped action surface, such as `.tasks`, `.v2Workspaces`, `.v2Projects`, or `.chatSessions`, so every call site gets the same behavior:

- apply the optimistic collection mutation immediately
- attach a rejection handler to `tx.isPersisted.promise`
- show a user-visible error when persistence fails
- let TanStack DB own rollback

Use `{ optimistic: false }` only for exceptional flows where the UI must wait for server confirmation before revealing the result, such as a workflow that depends on a server-generated identifier or a multi-step server-side effect.

## Offline-First Boundary

Offline-first needs more than optimistic state. It needs durable local persistence, queued transactions, replay ordering, idempotency, and conflict handling. If we decide to support offline task writes later, design it as a separate feature with:

- a durable transaction queue
- client-generated stable IDs for created records
- idempotent API mutations
- explicit conflict policy per write type
- UI for pending and failed replays

Until then, Electric is our read/sync confirmation path and the API remains the write authority.
