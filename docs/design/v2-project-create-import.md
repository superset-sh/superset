# V2 Project Create & Import

Design for the v2 "create project" and "import project" flows. V2 projects are cloud-driven; materialization is per-host but resolved lazily, not pre-computed.

---

## Two rules for v1

- **Sidebar** — pinned projects and their workspaces. Pin happens as a side-effect of `project.create` / `project.setup`; there's no standalone pin UI.
- **Workspaces tab** — workspaces in the user's active org scoped to hosts the user is linked to via `v2_users_hosts`. No filtering by pin or online status.

Everything below serves one of those two rules.

---

## Backing: local-only, action-time

A project is **backed on a host** iff that host's `host-service.projects` table has a row for it (`packages/host-service/src/db/schema.ts:32`):

```ts
projects {
  id text PK               // matches cloud v2_projects.id
  repoPath text NOT NULL   // local main repo path
  repoProvider, repoOwner, repoName, repoUrl, remoteName
  createdAt
}
```

`workspaces.projectId` FKs to this — no project row means no workspaces on that host.

Backing is checked at the point of action (workspace creation, git ops). Remote hosts' backing state is their own business — we never render it.

---

## State matrix

Two axes, one per data source:

| # | Cloud `v2_projects` | Host-service `projects` | Meaning | Action |
| --- | --- | --- | --- | --- |
| 1 | ✓ | ✗ | Cloud-only on this host | `project.setup` |
| 2 | ✓ | ✓ | Backed here | — |
| 3 | ✗ | — | Brand new | `project.create` |

Stale `repoPath` fails at action time and surfaces as a toast. v1 has no automated recovery — user removes + re-imports if they want to fix it.

---

## Host-service as orchestrator

Every client calls host-service. Desktop today; web/mobile route through host-service later. The host-service RPC **is the create flow** — cloud-row creation, optional GitHub repo provisioning, local git, local DB insert.

Neither `project.create` nor `project.setup` auto-creates a workspace. Workspaces are always explicit user action.

### `project.create`

User-facing intent: **"clone a new project."** Cloud row + local clone.

```ts
project.create({
  name: string,
  mode:
    | { kind: "empty";       parentDir: string;                         visibility: "private" | "public" }
    | { kind: "clone";       parentDir: string; url: string }
    | { kind: "importLocal"; repoPath: string }
    | { kind: "template";    parentDir: string; templateId: string;     visibility: "private" | "public" }
}) → { projectId: string; repoPath: string }
```

`visibility` lives on the GitHub-provisioning modes (`empty`, `template`) only. `clone` and `importLocal` reuse an existing remote when one is present; local-only repos create a project without `repoCloneUrl`.

Path semantics are baked into each variant: `parentDir` for modes that create a new directory; `repoPath` (git root) for `importLocal`.

Ordering:

1. `clone` — clone first into `parentDir`. On clone failure we leave no cloud state behind.
2. Cloud: create `v2_projects` row. On failure, `rmSync` the clone to roll back.
3. Upsert local `host-service.projects` row.

`importLocal` does cloud-then-local (no remote work to roll back).

**Always materializes on the calling host.** No cloud-only mode.

Phase 1 ships `clone` and `importLocal` only; `empty` and `template` throw `not_implemented`.

### `project.setup`

User-facing intent: **"import."** Cell-1 → cell-2 (first-time setup).

```ts
project.setup({
  projectId: string,
  mode:
    | { kind: "clone";  parentDir: string }
    | { kind: "import"; repoPath: string }
}) → { repoPath: string }
```

**No re-pointing in v1.** If a `host-service.projects` row already exists for `projectId`:
- Same resolved path → no-op success (idempotent).
- Different path → `CONFLICT`. Caller must `project.remove` first to re-import elsewhere.

### `project.findByPath`

```ts
project.findByPath({ repoPath }) → {
  candidates: Array<{ id, name, slug, organizationId, organizationName }>
}
```

Validates git root, reads the remote, forwards to cloud `v2Projects.findByGitHubRemote`. Drives the folder-first import picker.

### `project.remove`

Deletes the local row, worktrees, and the repo directory.

### Client responsibilities

Native pickers stay in the client — host-service has no UI.

---

## Existing types — reuse, don't redeclare

| Need | Source |
| --- | --- |
| Cloud project row | `typeof v2Projects.$inferSelect` |
| Cloud project creation | `v2Projects.create` — `{ organizationId, name, slug, repoCloneUrl }` (jwt-scoped) |
| Workspace (cloud) | `typeof v2Workspaces.$inferSelect` |
| Host (cloud) | `typeof v2Hosts.$inferSelect` |
| Host-service project row | `typeof projects.$inferSelect` |
| Host-service workspace row | `typeof workspaces.$inferSelect` |
| Current host identity | `useLocalHostService().machineId` + `activeHostUrl` |
| Pinned-in-sidebar rows | `v2SidebarProjects` / `v2WorkspaceLocalState` (localStorage) |

---

## Sidebar

**Pin alone.** A pinned project (`v2SidebarProjects` row) renders. No backing-derived filtering, no row decoration. `useDashboardSidebarData` does not call host-service.

Entry points (in the sidebar `+` dropdown):

- **"+ New project"** → `project.create`
- **"Import existing folder"** → folder-first picker

That's it. No "Pin existing project" action, no Available section, no inline setup step. Add them back in a later PR if users report missing them.

### Remote-device workspace clicks

No gating. A remote workspace opens the normal workspace page — you can see it the same way as a local one. Operations that assume local filesystem (terminal spawn, local git) will fail at the point they're triggered; we'll address those as they surface.

---

## Workspaces tab

Lists workspaces in the user's active org scoped to hosts the user is linked to via `v2_users_hosts` (`workspaces.organizationId === activeOrganizationId AND userHosts.userId === currentUserId`). Teammates' workspaces on hosts you aren't linked to are not surfaced here.

Rows indicate their host via a `hostType` chip (`local-device` / `remote-device` / `cloud`). Remote-device clicks route to the same stub as the sidebar.

No Available section. No "+ New project" or "Import folder" CTAs — those live in the sidebar dropdown.

---

## Folder-first import — picker flow

1. User clicks "Import existing folder" → native picker.
2. Client calls `project.findByPath({ repoPath })`.
3. Host-service validates git root, reads a GitHub remote when one exists, and forwards to `v2Projects.findByGitHubRemote({ repoCloneUrl })`.
4. Cloud filters to projects in orgs the user belongs to.
5. Client branches on `candidates.length`:
   - **0** → "No match — create as new project" (pivots to `project.create importLocal`; local-only repos always take this path).
   - **1, not yet set up here** → auto-advance to `project.setup({ projectId, mode: { kind: "import", repoPath } })`.
   - **1, already set up here at a different path** → surface the `CONFLICT` error; user must `project.remove` first to re-import.
   - **>1** → picker; user picks; then `project.setup`.

Candidate list is scoped to the user's accessible orgs — not global.

---

## User journeys

### 1. New user, new org — first project

Sidebar `+` → "New project" → `project.create` → sidebar shows the project, no workspaces yet.

### 2. Join an org with existing projects

Workspaces tab shows workspaces in the org on hosts the user is linked to (via `v2_users_hosts`), including teammates' workspaces on hosts you share. Click any of them to open — local-fs operations degrade as they hit their limits; the workspace itself renders.

### 3. Adding a second host

New device, sidebar starts empty (pins are per-device). User re-pins via "New project" or "Import folder", or by clicking a remote workspace row and choosing "Set up here".

### 4. `repoPath` deleted out of band

Next git op or `workspace.create` fails with ENOENT. Handler surfaces the failure; recovery UX is deferred (see "Out of scope for v1").

---

## Flow summary

| Transition | RPC | Entry point |
| --- | --- | --- |
| cell 3 → cell 2 | `project.create` | Sidebar `+` → New project |
| cell 1 → cell 2 | `project.setup` | Folder-first import (non-conflict) |
| cell 2 → cell 2 (re-point) | _deferred_ | — (user removes + re-imports) |

---

## Out of scope for v1

- **Available section / rediscovery UX.** Workspaces tab just shows what exists; it doesn't surface cloud projects the user could pin.
- **Standalone pin UI.** Pins happen as a side-effect of create/setup.
- **Inline `project.setup` step in New Workspace modal.** If a pinned project ever gets into an unbacked state (e.g. cross-device pin sync), `workspace.create` fails with `PROJECT_NOT_SETUP` and we surface a toast. No modal recovery loop in v1.
- **Cross-device pin sync, auto-pin, unpin UX.**
- **GitHub repo creation (`project.create` `empty` / `template`).** Returns `not_implemented`.
- **Template source.**
- **Preemptive "host offline" / "not set up here" hints.**
- **Orphaned cloud-row cleanup.**

---

## Phasing

See [`plans/20260417-v2-project-create-import-impl.md`](../../plans/20260417-v2-project-create-import-impl.md).
