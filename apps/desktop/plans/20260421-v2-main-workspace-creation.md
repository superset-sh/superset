# V2 Main Workspace Creation

## Problem

V1 auto-creates a singleton `type='branch'` workspace per project via
`ensureMainWorkspace` (`apps/desktop/src/lib/trpc/routers/projects/projects.ts:174`),
called inline from five mutations. V2 has no equivalent — `v2_workspaces` rows only
come from `workspaceCreation`, which always produces worktrees. Users finish
`project.setup` and see an empty sidebar.

## Goals

- Each `(projectId, hostId)` gets one "main" workspace whose path == the host's
  `repoPath`. Multiple mains per project (one per host) are allowed.
- Created automatically on `project.setup` success — no type picker, no UI step.
- Lifecycle identical to worktree workspaces (cascade on project/host delete, no
  special offline treatment).

## Design

### Schema

Add to `v2_workspaces` (`packages/db/src/schema/schema.ts:524`):

```ts
type: v2WorkspaceType().notNull().default("worktree"),
```

Backed by a `pgEnum("v2_workspace_type", ["main", "worktree"])` for DB-level
enforcement, matching the `v2ClientType` / `v2UsersHostRole` precedent.
Partial unique index: `(projectId, hostId) WHERE type = 'main'`.

Column name `type` over `isMain: boolean` so the workspace-creation modal's
contract is explicit — it only ever writes `'worktree'`.

### `ensureMainWorkspace` helper (host-service)

New helper in `packages/host-service/src/trpc/router/project/`. Given
`(projectId, repoPath)`:

1. `ensureV2Host` (reuse call from `workspace-creation.ts:372`).
2. Resolve current branch: `git symbolic-ref --short HEAD` at `repoPath`.
3. `ctx.api.v2Workspace.create.mutate({ ..., type: "main", branch, name: branch })`.
   Skip if the unique index rejects — idempotent.
4. Insert local `workspaces` row (`packages/host-service/src/db/schema.ts:95`)
   with `worktreePath = repoPath`. The column is named `worktreePath` but holds
   any absolute checkout path; for main that's the repo root.

Log-and-continue on failure: any cloud/local error is caught, logged, and
swallowed (the helper returns `null`). `project.setup` doesn't regress when a
transient cloud blip hits — the startup sweep backfills on the next boot.
Idempotency via the partial unique index handles duplicates on retry.

### Call sites

Two:

1. **`project.setup` success** (`packages/host-service/src/trpc/router/project/project.ts:134`) —
   after `persistLocalProject` in both `clone` and `import` branches.
2. **Host-service startup sweep** — on boot, iterate local `projects` rows and
   call the helper for each. Idempotent via the unique index, so it's safe on
   every boot; in practice only does work once per pre-existing project. This is
   the recovery path for projects already set up before this change ships.

### Modal

No changes. Workspace-creation modal continues to write `type: 'worktree'`.

## Migration

`bunx drizzle-kit generate --name="v2_workspaces_main_type_and_pin"`. No SQL backfill — the
cloud doesn't know `repoPath` or current branch. Existing setups are filled in by
the startup sweep the first time the updated host-service boots.

## Rollout

Cloud/API before desktop (per deploy ordering). Verify:

- Fresh `project.setup` creates exactly one main row + local row.
- Re-running `project.setup` on the same host is idempotent.
- Two hosts on one project each get their own main row.
- Startup sweep fills in a main row for a project set up pre-update, without
  duplicating on subsequent boots.
- `project.remove` cleans up the main row alongside worktrees.

## Open question

Should the main workspace's `name` track branch renames, or stay frozen at setup
time? Lean: frozen — it's a user-visible label and worktree workspaces don't
auto-rename either.
