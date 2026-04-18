# V2 Project Create & Import — Implementation Plan

Companion to [`docs/design/v2-project-create-import.md`](../docs/design/v2-project-create-import.md).

> **Rewrite note.** An earlier version of this plan had four phases centred on a `v2_host_projects` cloud signal and backing-aware sidebar row states. PR review collapsed the design — no cloud backing signal, no per-row state decoration, backing checked at action time. This plan reflects the simplified scope. See the design doc's "Why not a cloud backing signal" section for the argument.

---

## Phase 1 — create, import, and inline workspace setup

The MVP. Covers every flow the user can enter: new project, pin & set up, folder-first import, and workspace-create on a host that isn't yet set up.

### Cloud (packages/db, packages/trpc)

- [ ] `v2Projects.findByGitHubRemote({ repoCloneUrl })` — returns matching projects scoped to the user's accessible orgs. Lowercase-matched against `githubRepositories.fullName`. (Renamed from the earlier `findByRemote`.)

No new tables. No new Electric collections. No new routers.

### Host-service (packages/host-service)

- [ ] `project.list` — returns `Array<{ id, repoPath }>`. Pure DB read, no filesystem check.
- [ ] `project.findByPath({ repoPath })` — validates git root, reads remote, forwards to cloud `v2Projects.findByGitHubRemote`. Returns candidate projects.
- [ ] `project.create` — discriminated-union mode (`empty`/`clone`/`importLocal`/`template`); Phase 1 implements `clone` and `importLocal` only, others throw `not_implemented`. Writes local `host-service.projects` only (no cloud backing upsert).
- [ ] `project.setup` — discriminated-union mode (`clone`/`import`) with per-variant path semantics. `acknowledgeWorkspaceInvalidation` param gates the re-point case.
- [ ] `project.remove` — deletes local worktrees + project row + repo directory. No cloud backing row to clean up.

### Desktop renderer (apps/desktop)

- [ ] `useDashboardSidebarData` — pin-driven visibility only. No `project.list` query, no `v2_host_projects` live query, no backing derivation, no row-state decoration.
- [ ] Add-repository modals, mounted at the dashboard layout level:
  - `NewProjectModal` — drives `project.create` (clone + importLocal).
  - `PinAndSetupModal` — drives `project.setup`; accepts `forceRepoint` for repair.
  - `FolderFirstImportModal` — drives the folder-first picker state machine.
  - `ParentDirectoryPicker` — shared native-picker input used by NewProjectModal + PinAndSetupModal.
  - `useFolderFirstImport` — hook that orchestrates the picker flow.
- [ ] Workspaces-tab Available section: lists cloud projects not pinned; three actions — "+ New project", "Pin & set up" per row, "Import existing folder."
- [ ] Folder-first picker branching:
  - `candidates.length === 0` → "No match — create as new project" (pivots to `project.create importLocal`).
  - `=== 1` and not set up on this host → auto-advance to `project.setup`.
  - `=== 1` and already set up → confirm re-point (`acknowledgeWorkspaceInvalidation`).
  - `> 1` → chooser modal, user picks projectId.
- [ ] New Workspace modal — inline setup step:
  - On mount, call `activeHostClient.project.list.query()`.
  - If target `projectId` not in list, render the `PinAndSetupModal` body as an inline step. On success, transition to the normal branch/name form.
- [ ] `workspace.create` throws `PROJECT_NOT_SETUP` (with `projectId` in payload) when local host has no row. Modal catches and loops through inline setup; scripted callers can inspect the error code.
- [ ] Remote-device workspace row click → `WorkspaceNotOnThisHostState` stub page ("switch host or set up here"). Set-up-here triggers `PinAndSetupModal` for the project.
- [ ] Error-path repair: git ops / `workspace.create` catch vanished-path errors (ENOENT on `repoPath`), invalidate `["project", "list"]`, open `PinAndSetupModal` with `forceRepoint: true`.
- [ ] React Query invalidation on `["project", "list"]` after `project.create` / `project.setup` / `project.remove`.

### Acceptance

- Creating a project via "+ New project" pins it and produces a sidebar row with no workspaces.
- Pinning + setting up an existing cloud project from Available produces the same end state.
- Pinning a project not yet set up on this host does not decorate the row. Clicking "+ New workspace" drops into inline setup, then creates the workspace.
- Deleting the repo directory out of band is caught on the next git/workspace op and surfaces the repair modal.
- Importing a folder whose remote matches multiple projects surfaces the picker.
- Importing a folder whose remote matches a project that's already set up on this host prompts for destructive re-point confirmation.

---

## Deferred / out of scope

- **GitHub auth for repo creation.** Needed before `project.create` `empty` / `template` modes ship. Likely GitHub App installation fetched via `ctx.api`.
- **Template source.** Where templates live; `project.create` mode stub throws `not_implemented` until decided.
- **Mid-flow failure visibility.** Whether to surface an inline "setup unfinished" prompt on the originating client, or rely on Available.
- **Orphaned cloud rows.** `v2_projects` rows with no host-service row anywhere, from abandoned retries. TTL cleanup is a separate decision.
- **Pin behavior.** Auto-pin on create/setup, cross-device pin sync, unpin UX. Tuned separately.
- **Preemptive "not set up here" / "host offline" hints.** Explicitly cut. If users report confusion, cheapest add-back is an on-hover `project.list` probe — no schema change, no cloud signal.
- **Wrong-remote detection.** Rare enough we don't model it; `project.setup` prevents entry. No repair path.
