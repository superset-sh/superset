# V2 Local Workspace on Project Setup

Explores adopting V1's "auto-create local workspace on import" pattern for V2, and using workspace presence as a setup signal.

## V1 Pattern

When V1 imports a project (`openNew`, `openFromPath`, `cloneRepo`), it calls `ensureMainWorkspace(project)` which creates a `type="branch"` workspace:

- Points at `project.mainRepoPath` (no separate worktree)
- `worktreeId = NULL`
- Unique per project (enforced by partial index `workspaces_unique_branch_per_project`)
- Gives the user an immediate landing page after import

**Files:**
- `apps/desktop/src/lib/trpc/routers/projects/projects.ts:174` — `ensureMainWorkspace`
- `packages/local-db/src/schema/schema.ts:97-150` — `workspaces` table with `type: "worktree" | "branch"`

## V2 Current State

- Host-service `workspaces` table (`packages/host-service/src/db/schema.ts`) has `worktreePath NOT NULL` — every workspace is a worktree
- `project.setup` creates the `projects` row but no workspace
- "Is project set up locally?" is derived from `projects.repoPath` existence via `getContext.setupStatus`
- No "main" workspace concept; users always have to create a worktree-based workspace

## The Idea

**Can "local workspace existence" replace `projects.repoPath` as the setup signal?**

- Project setup complete → auto-create a "main" workspace for that project on that host
- Project setup missing → no main workspace → prompt for setup
- Main workspace doubles as a landing page (V1 parity)

## Design Options

### Option 1 — Main workspace replaces setupStatus

- Add `type: "worktree" | "main"` to host-service `workspaces` (mirrors V1 schema)
- `project.setup` auto-creates a `type="main"` workspace
- `workspace.create` throws `PROJECT_NOT_SETUP` if no main workspace exists for projectId on this host
- `getContext` checks for main workspace instead of `projects.repoPath`

**Pros:** Single source of truth (workspace presence). Mirrors V1. Users get a landing page.
**Cons:** Conflates UX (landing page) with state (setup signal). Deleting the main workspace would break setup state. Requires schema migration + changes to the already-landed Phase 1 design.

### Option 2 — Main workspace as UX, separate from signal *(recommended)*

- Keep `projects.repoPath` as the authoritative setup signal (unchanged from Phase 1)
- `project.setup` **additionally** creates a main workspace alongside the `projects` row
- Main workspace is a UX convenience only — its absence doesn't mean "not setup"
- `workspace.create` still throws on missing `projects` row / missing path (unchanged)

**Pros:** Clean separation of concerns. No change to Phase 1 setup detection. V1-parity landing page. Delete-safe (can delete main workspace without breaking anything).
**Cons:** Two places to keep in sync on setup (projects row + workspace). Main workspace needs its own path semantics (`worktreePath = repoPath` or separate type).

### Option 3 — Cloud-side signal via `v2_workspaces`

- Create a cloud `v2_workspaces` row on `project.setup` (type="main", hostId=current host)
- Setup status is derived from: "does a main v2_workspace exist for this project + host?"
- UI across all devices sees "this project is set up on hosts X, Y, Z" naturally

**Pros:** Multi-device visibility. Natural integration with cloud data model.
**Cons:** Requires cloud schema migration. Breaks the "local-only path storage" decision from `v2-host-project-paths.md`. Doesn't solve landing-page UX on its own.

## Recommendation: Option 2

Keep Phase 1 intact. On `project.setup` success, also insert a main workspace so the user has somewhere to land. Treat it as pure UX — the authoritative setup signal stays in `projects.repoPath`.

### Schema Changes

`packages/host-service/src/db/schema.ts` — add `type` to `workspaces`:

```ts
workspaces = sqliteTable("workspaces", {
  id: text().primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, ...),
  type: text({ enum: ["worktree", "main"] }).notNull().default("worktree"),
  worktreePath: text("worktree_path").notNull(), // for main: equals project.repoPath
  branch: text().notNull(),
  headSha: text("head_sha"),
  pullRequestId: text("pull_request_id").references(...),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
});
```

- Partial unique index: `UNIQUE(project_id) WHERE type = 'main'` — one main per project
- `worktreePath` reused for main (= `repoPath`) to avoid a nullable column

### `project.setup` Behavior

After upserting the `projects` row, insert (or update) the main workspace:

```ts
ctx.db.insert(workspaces).values({
  id: generateId(),
  projectId: input.projectId,
  type: "main",
  worktreePath: resolved.repoPath,
  branch: defaultBranch,  // detected via git symbolic-ref
}).onConflictDoNothing().run();

// Also create cloud v2_workspace row so it shows up in the sidebar
await ctx.api.v2Workspace.create.mutate({ ... });
```

Re-running setup with a new path updates `projects.repoPath` and the main workspace's `worktreePath` to match.

### `workspace.create` Behavior

Unchanged from Phase 1 — still throws `PROJECT_NOT_SETUP` / `PROJECT_PATH_MISSING` based on `projects.repoPath`. Main workspace is orthogonal.

## Interaction with Add Repository Flows

Tying back to `v2-add-repository-flows.md`:

- Import flow (#1): browse → match → `project.setup` → **main workspace auto-created** → user lands in it
- Manual setup (#2): pick project → `project.setup` → same result
- Clone (#3): `project.setup(clone)` → same result

In all three, the user ends up at a main workspace after setup — no need to separately create a workspace just to land somewhere.

## Edge Cases

- **User deletes main workspace** — fine. `projects.repoPath` still says setup is complete. User can create new worktree workspaces as before. They don't get a landing page until they re-run setup or manually re-create it.
- **Re-run setup on new path** — main workspace's `worktreePath` updates to the new path. Any branch workspaces (worktrees) created under the old path are orphaned — those are in `.worktrees/` under the old repo path, not under the new one.
- **Main workspace shown in UI** — should render with a different icon/label ("main" vs. branch name) so users know it's the repo root, not a dedicated worktree.

## Phasing

1. **Phase A** — Add `type` column + migration to host-service `workspaces`
2. **Phase B** — Update `project.setup` to create main workspace + cloud row
3. **Phase C** — Update sidebar / workspace list UI to render main workspaces distinctly
4. **Phase D (optional)** — Add "Create main workspace" recovery action if user deletes theirs
