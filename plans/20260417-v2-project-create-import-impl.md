# V2 Project Create & Import — Implementation Plan

Companion to [`docs/design/v2-project-create-import.md`](../docs/design/v2-project-create-import.md). This is the execution plan: what to build, in what order, and what each phase leaves stubbed for the next.

---

## Phase 1 — core backing-aware sidebar + create/setup

The MVP. Intentionally broad — the pieces are tightly coupled (backing signal, sidebar state derivation, and create/setup flows all depend on each other; shipping a subset would leave the sidebar half-wired).

### Cloud (packages/db, packages/trpc, Electric)

- [ ] `v2_host_projects` cloud table — Drizzle schema + migration. Columns: `id`, `organizationId`, `projectId`, `hostId`, `createdAt`, `updatedAt`. Unique on `(projectId, hostId)`.
- [ ] Electric sync config for `v2_host_projects` (mirror existing `v2_*` tables).
- [ ] Cloud `v2HostProjects` tRPC router — `upsert`, `delete`. Authorized by `v2_users_hosts` membership.
- [ ] Cloud `v2Projects.findByRemote({ repoCloneUrl })` — returns matching projects scoped to the user's accessible orgs.

### Host-service (packages/host-service)

- [ ] `project.list` — returns `Array<{ id, repoPath }>`. Pure DB read, no filesystem check. Proactive `statSync` / Stale-path detection is Phase 4.
- [ ] `project.findByPath({ repoPath })` — validates git root, reads remote, forwards to cloud `v2Projects.findByRemote`. Returns candidate projects.
- [ ] `project.create` — discriminated-union mode (`empty`/`clone`/`importLocal`/`template`); Phase 1 implements `clone` and `importLocal` only, others throw `not_implemented`. Writes local `host-service.projects` + cloud `v2_host_projects`.
- [ ] `project.setup` — discriminated-union mode (`clone`/`import`) with per-variant path semantics. Adds `acknowledgeWorkspaceInvalidation` param. Also upserts cloud `v2_host_projects`.
- [ ] `project.remove` — delete cloud `v2_host_projects` for current host on removal.

### Desktop renderer (apps/desktop)

- [ ] Register `v2HostProjects` collection in `CollectionsProvider`.
- [ ] Extend `useDashboardSidebarData`:
  - Local backing via React Query against `activeHostClient.project.list` (key `["project", "list"]`). Invalidated after mutations; error handlers on `workspace.create` / git ops invalidate on "vanished path" errors.
  - Remote backing via `useLiveQuery` over `v2_host_projects ⋈ v2_hosts`, partitioned online/offline, excluding current machineId.
  - Derived row state per pinned project (Normal / Host offline / Not set up here — three states in Phase 1; Stale path is Phase 4).
- [ ] Sidebar project row renders three row states. Phase 1 surfaces Normal fully; Host offline / Not set up here render as visual markers with no inline CTA yet (stubs for Phase 2).
- [ ] Workspaces tab: Available section with three actions — "+ New project", "Pin & set up" (per cloud project row), "Import existing folder."
- [ ] Folder-first picker UI:
  - Native picker → `project.findByPath`.
  - `candidates.length === 0` → offer "No match — create as new project" (pivots to `project.create importLocal`).
  - `=== 1` → auto-advance to `project.setup`.
  - `> 1` → chooser modal, user picks projectId.
- [ ] React Query invalidation on `["project", "list"]` after `project.create` / `project.setup` / `project.remove`.

### Acceptance

- Creating a project via "+ New project" results in a sidebar row in the Normal state, no workspaces under it, and a `v2_host_projects` row visible to other connected hosts within Electric sync latency.
- Pinning + setting up an existing cloud project from the workspaces tab's Available section produces the same end state.
- Pinning a project whose only backing is on an offline host renders the "Host offline" marker.
- Pinning a project with no backing anywhere renders the "Not set up here" marker (CTA not yet wired).
- Importing a folder whose remote matches multiple projects surfaces the picker.
- Deleting the repo directory out of band is not caught by the sidebar until the user triggers an operation that fails — by design (proactive detection is Phase 4).

---

## Phase 2 — row-state polish

Un-stub the three non-Normal row states from Phase 1.

- [ ] "Not set up here" inline CTA → opens the same `project.setup` modal as Available's "Pin & set up" (with the projectId pre-filled from the sidebar row).
- [ ] "Host offline" state: copy + visual treatment; no action required (passive — resolves when a backing host reconnects).
- [ ] Host chips on workspace rows (`current-host | remote-device | cloud`) using the existing `hostType` derivation.

---

## Phase 3 — workspace-create inline setup

Couple `workspace.create` to the setup flow so unbacked-host workspace creation doesn't fail cold.

- [ ] `workspace.create` throws `PROJECT_NOT_SETUP` (with projectId in payload) when current host has no `host-service.projects` row for the target project.
- [ ] New Workspace modal catches the throw, opens the inline `project.setup` flow, retries `workspace.create` on success.
- [ ] Remote-device workspace row click → "switch host or set up here" stub page. Design for this page lives outside this plan; link out once written.

---

## Phase 4 — stale-path detection + repair

Add proactive Stale-path detection and wire the Repair CTA.

- [ ] `project.list` returns `pathStatus: "healthy" | "missing"` via `statSync` at read time.
- [ ] `useDashboardSidebarData` adds a modest `refetchInterval` (30–60s) to catch out-of-band directory deletions.
- [ ] Fourth row state "Stale path" driven by `pathStatus: "missing"` on local backing.
- [ ] Stale-path sidebar row shows Repair CTA.
- [ ] Repair opens the `project.setup` modal with `acknowledgeWorkspaceInvalidation: true` pre-set.
- [ ] Copy explains that re-pointing the path invalidates existing workspace rows under the project; user confirms.
- [ ] On success, state returns to Normal; downstream workspace rows may need re-creation (out of scope — workspace-level concern).

---

## Deferred / out of scope

From the design doc's open questions:

- **GitHub auth for repo creation.** Needed before `project.create` `empty` / `template` modes ship. Likely GitHub App installation fetched via `ctx.api`. Out of Phase 1.
- **Template source.** Where templates live; `project.create` mode stub throws `not_implemented` until decided.
- **Mid-flow failure visibility.** Whether to surface an inline "setup unfinished" prompt on the originating client, or rely on Available. Not critical for Phase 1.
- **Orphaned cloud rows.** `v2_projects` rows with no `v2_host_projects` anywhere, from abandoned retries. Available surfaces them as cell 1. TTL cleanup is a separate decision.
- **Pin behavior.** Auto-pin on create/setup, cross-device pin sync, unpin UX. Binary input to this design; tuned separately.
- **Wrong-remote detection (cell 4).** Rare enough that we don't model it; `project.setup` prevents entry. No repair path.
