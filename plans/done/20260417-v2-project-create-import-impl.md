# V2 Project Create & Import — Implementation Plan

Companion to [`docs/design/v2-project-create-import.md`](../../docs/design/v2-project-create-import.md).

---

## Phase 1 — MVP

### Cloud (packages/db, packages/trpc)

- [x] `v2Projects.findByGitHubRemote({ organizationId, repoCloneUrl })` — scoped matcher against `githubRepositories.fullName`.

No new tables. No new Electric collections.

### Host-service (packages/host-service)

- [x] `project.findByPath({ repoPath })` — validates git root, reads remote, forwards to cloud.
- [x] `project.create` — discriminated-union mode; Phase 1 ships `clone` + `importLocal`, others throw `not_implemented`. Clone-then-cloud ordering with rollback on cloud failure.
- [x] `project.setup` — discriminated-union mode (`clone` / `import`). Same-path is an idempotent no-op; different-path throws `CONFLICT` (v1 has no re-point escape hatch).
- [x] `project.remove` — deletes local worktrees + project row + repo directory.

### Desktop renderer (apps/desktop)

- [x] `useDashboardSidebarData` — pin-driven only.
- [x] Add-repository modals, mounted at the dashboard layout level:
  - `NewProjectModal` — v1 new-project UI (Location + Clone/Template tabs) as a modal; drives `project.create` (clone).
  - `FolderFirstImportModal` — drives the folder-first picker state machine.
  - `useFolderFirstImport` — orchestration hook.
- [x] Sidebar `+` dropdown: "New project" and "Import existing folder". No "Pin existing project" action.
- [x] Folder-first picker branching (0 / 1-new / 1-already / >1).
- [x] Workspaces tab: lists every workspace in the active org. No Available section, no CTAs.
- [x] Remote-device workspace row click opens the normal workspace page — no gating. Local-fs operations degrade as they hit their limits.
- [x] Error-path for vanished `repoPath` surfaces as a toast; recovery UX deferred.
- [x] Sidebar pin reactivity after `project.create` / `project.setup` rides on `ensureProjectInSidebar` → `v2SidebarProjects` Electric collection. No React Query invalidation needed.

### Acceptance

- "New project" via sidebar dropdown creates the cloud row, clones locally, pins, and shows the project in the sidebar with no workspaces.
- "Import existing folder" against a repo that matches a cloud project sets it up and pins it; a non-matching folder offers create-as-new.
- A teammate's workspace on a remote device shows up in the workspaces tab; clicking it lands on the stub.
- Deleting the repo directory out of band surfaces a toast on the next git/workspace op. Recovery UX deferred.

---

## Explicitly deferred

- **Available section / rediscovery UX.** Workspaces tab only shows existing workspaces; cloud projects with no workspaces aren't surfaced.
- **Inline `project.setup` step inside New Workspace modal.** If `workspace.create` throws `PROJECT_NOT_SETUP`, the pending page shows a plain failure toast — no modal recovery loop.
- **Standalone pin UI.** Pin happens as a side-effect of `project.create` / `project.setup`.
- **Cross-device pin sync, auto-pin, unpin UX.**
- **GitHub repo creation** (`project.create` `empty` / `template` modes).
- **Template source.**
- **Preemptive "host offline" / "not set up here" hints.**
- **Orphaned `v2_projects` row cleanup.**
- **Wrong-remote detection** (rare; `project.setup` prevents entry).
