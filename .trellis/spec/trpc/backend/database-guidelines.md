# Database Guidelines

## Rules

- Use Drizzle ORM for database access.
- Do not touch production databases unless explicitly requested and confirmed.
- For cloud migrations, change schema files first and ask for `bunx drizzle-kit generate --name="<sample_name_snake_case>"`.
- Never manually edit `packages/db/drizzle/` SQL, snapshots, or journal files.
- Treat write/seeding effects differently from cache-first rendering; wait for strict readiness before deriving missing rows or writing defaults unless the write is provably idempotent.

## Examples

- `packages/trpc/src/root.ts`
- `packages/trpc/src/router/v2-workspace/v2-workspace.ts`
- `packages/trpc/src/router/chat/chat.ts`

## Scenario: Task V2 Project Association

### 1. Scope / Trigger

- Trigger: adding or changing a Task field that crosses PostgreSQL schema, cloud tRPC, Electric collections, and desktop renderer task UI.

### 2. Signatures

- DB: `tasks.v2ProjectId` maps to `tasks.v2_project_id uuid`, nullable, references `v2_projects.id`, and deletes with `set null`.
- DB index: `tasks_v2_project_id_idx`.
- tRPC create/update input: `v2ProjectId?: uuid | null`.
- tRPC list input: `projectMode?: "all" | "projectless" | "project"`, `v2ProjectId?: uuid | null`.
- Desktop collection mutation: `collections.tasks.update(taskId, draft => { draft.v2ProjectId = value })`.

### 3. Contracts

- Existing tasks may remain projectless. Never hide projectless rows just because V2 projects exist.
- Create and update must validate selected projects against the task organization before writing.
- Clearing a project must use `null`, not an empty string or sentinel value.
- UI route/search sentinels such as `"__projectless"` must stay in renderer filter state and must not be persisted into `tasks.v2ProjectId`.
- Generated Drizzle migration files are allowed only from `drizzle-kit generate`; do not hand-edit SQL, snapshots, or `_journal.json`.

### 4. Validation & Error Matrix

- Project id belongs to another organization -> `BAD_REQUEST` with a project ownership message.
- `v2ProjectId: null` on update -> clear the project without project lookup.
- Project filter is `"all"` -> no project predicate.
- Project filter is `"projectless"` -> `tasks.v2ProjectId is null`.
- Project filter is `"project"` with id -> `tasks.v2ProjectId = id`.

### 5. Good/Base/Bad Cases

- Good: `task.create` validates status, assignee, and V2 project in the same transaction, writes `v2ProjectId`, and returns the task plus txid.
- Base: existing Linear-synced and local tasks render with `v2ProjectId = null`.
- Bad: desktop auto-selects the first project for the Tasks tab and hides all projectless tasks.

### 6. Tests Required

- Router tests for cross-organization project rejection and same-organization project update.
- Router create tests for the full insert payload whenever a schema field is added to `tasks`; include default/null payloads and rich payloads that exercise the new column.
- Renderer source/component tests proving the Tasks tab is not Linear-gated and board/table receive the same project filter.
- Selection tests should include `v2ProjectId` and `project` in `TaskWithStatus` fixtures.
- Desktop Automation smoke should at least prove `/tasks` renders without a Linear gate; full create/detail smoke needs a disposable E2E account and cleanup/restoration.
- Before real desktop create/detail smoke for a new DB column, apply local migrations and run a DB shape probe against `information_schema.columns`; a rendered dialog is not proof that the runtime insert path has the new column.

### 7. Wrong vs Correct

#### Wrong

```ts
await task.update({ id, v2ProjectId: "__projectless" });
```

#### Correct

```ts
await task.update({ id, v2ProjectId: null });
```
