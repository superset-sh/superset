# V2 Create-Project Flow Audit

**Date:** 2026-04-29
**Branch:** `audit-create-project-flow`
**Scope:** `apps/desktop` v2 new-project surface

## ⚠️ Hard constraint (added 2026-04-30 after incident)

**Never modify any code that v1 surfaces transitively reach.** Even when a page or
procedure is shared with v2, if any v1 entry point links to it the code is OFF
LIMITS. "Shared infra" is not a license to upgrade — migrating a shared path
silently changes v1's behavior.

For this audit specifically:

- `apps/desktop/src/renderer/routes/_authenticated/_onboarding/new-project/` is
  reached by v1's StartView and WorkspaceSidebarFooter. **The page and its
  three tabs cannot be rewired** even though v2 also uses (or could use) them.
- `apps/desktop/src/lib/trpc/routers/projects/projects.ts` (`cloneRepo`,
  `createEmptyRepo`, `openNew`) are v1's IPC procedures. **They cannot be
  removed or rewired** while v1 callers exist.
- `useOpenProject` / `useOpenNew` / `useOpenFromPath` in
  `apps/desktop/src/renderer/react-query/projects/` are v1-reached. **Untouchable.**

The only way to satisfy "host service is the source of truth in v2" without
touching v1 is to build **v2-only alternatives** and migrate v2 callers to them,
leaving the v1-reached path completely alone.

**What that means for the consolidation plan below:**

- The "delete legacy IPC" steps (audit's step 13) cannot run while v1 lives.
  They become "delete after v1 sunset" — tied to the v1-removal PR, not this
  effort.
- The "rewire `/new-project` tabs" steps (audit's steps 7–9) are forbidden
  unless we first build a v2-only `/v2/new-project` route with new tabs that
  call host-service. The original `/new-project` and its tabs stay on
  `electronTrpc.projects.*`.
- The "v2 dashboard dropdown links to `/new-project`" rewire (audit's
  partial step 12) is forbidden for the same reason — we'd be sending v2
  users into a v1-reached page. The v2 dropdown either (a) opens
  `NewProjectModal` (which is already v2-only and host-service-backed) or
  (b) navigates to a new `/v2/new-project` route that doesn't exist yet.

The cloud-side prerequisites (`v2Project.create` accepting `id?`,
`v2Project.delete` JWT migration) and the host-service saga refactors don't
touch v1 — they're safe to ship. But they need v2-only consumers, not the
shared `/new-project` page.

## Locked-in decisions (2026-04-30, post-reset)

After the reset, re-walked every decision under the "never touch v1" rule.
The plan below replaces all earlier "consolidate via /new-project" thinking.

| # | Decision | Choice |
|---|---|---|
| 1 | v2 strategy | Extend `NewProjectModal` as the canonical v2 create surface. No new route. |
| 2 | Cloud prereqs | Re-ship both: `v2Project.delete` → `jwtProcedure` + idempotent, `v2Project.create` accepts `id?` |
| 3 | Host-service saga | Re-ship all four mode handlers (clone/importLocal inverted, empty + template new) + cloud-first `project.remove` delete saga |
| 4 | Modal tabs | Leave empty + template as "coming soon" stubs for now. Modal is clone-only. |
| 5 | `visibility` schema field | Keep on host-service schema for empty/template; no UI consumer yet |
| 6 | `DeleteProjectSection` caller fix | Yes — thread `organizationId` through (fixes the dormant Delete button) |
| 7 | `DeleteProjectSection` route | Through host-service `client.project.remove` (single canonical v2 delete path) |
| 8 | v2 dashboard dropdown | Leave as-is — keeps opening `NewProjectModal` |
| 9 | Modal-level FSM | Skip. Per-tab `mutation.isPending` is enough while only clone is active |
| 10 | Strict ensure variant | Yes — ship `ensureMainWorkspaceStrict()` for the saga; lenient version stays for sweep + `project.setup` |
| 11 | Workspace-fail rollback | Cloud-delete via `v2Project.delete` + full local cleanup. Saga is the commit unit |
| 12 | PK conflict mapping | Walk `err.cause` chain for `constraint === "v2_projects_pkey"`; throw `CONFLICT 409` |
| 13 | Disk on project delete | Never auto-rm. Saga returns `repoPath` for a future explicit "delete files too" UI |
| 14 | Templates list location | Ship in host-service config now (`utils/templates.ts`); UI deferred |

### Implementation sequence (each step shippable on its own)

All v2-only. Server-side first, mirroring the v2 delete-workspace audit pattern.

1. Merge `origin/main` into the branch.
2. **Cloud prereqs:** `v2Project.delete` → `jwtProcedure` + idempotent + `v2Project.create` accepts `id?` + PK-conflict cause-walk. Single commit.
3. **Host-service saga:** add `ensureMainWorkspaceStrict`, invert `createFromClone` and `createFromImportLocal` to local-first, add `createFromEmpty` + `createFromTemplate`, add `initEmptyRepo` + `cloneTemplateInto` helpers + templates config. Single commit.
4. **Host-service `project.remove` rework:** cloud-delete first, never auto-rm, returns `repoPath`. Single commit.
5. **`DeleteProjectSection` fixup:** pass `organizationId` from `V2ProjectSettings`, call `client.project.remove` instead of `apiTrpcClient.v2Project.delete` directly. Single commit.

### What stays untouched (v1-reached, off-limits)

- `apps/desktop/src/renderer/routes/_authenticated/_onboarding/new-project/` — entire folder
- `apps/desktop/src/lib/trpc/routers/projects/projects.ts` — `cloneRepo`, `createEmptyRepo`, `openNew`, helpers
- `apps/desktop/src/renderer/react-query/projects/useOpenProject*.tsx` — `useOpenProject`, `useOpenNew`, `useOpenFromPath`
- `apps/desktop/src/renderer/stores/add-repository-modal.ts` — used by `NewProjectModal` and `ProjectPickerPill`
- `NewProjectModal.tsx` and the v2 sidebar dropdown — no behavior change beyond what already works (clone)

## TL;DR

The v2 "new project" flow has **two parallel implementations**, **no FSM**, **no rollback on failure**, and the clone-from-git path is missing several steps the empty-repo path has and several steps users would reasonably expect (install, setup-script, env seeding). Project-creation success is decided from the union of disk truth + DB truth + settings truth, with no single state owner — so partial failures leak orphan directories and project rows without workspaces.

## Entry points

- **Full-page flow:** `apps/desktop/src/renderer/routes/_authenticated/_onboarding/new-project/page.tsx` with three tabs:
  - `components/CloneRepoTab/CloneRepoTab.tsx` (lines 1–67)
  - `components/EmptyRepoTab/EmptyRepoTab.tsx` (lines 1–68)
  - `components/TemplateTab/TemplateTab.tsx` (lines 1–143)
- **Modal flow (parallel impl):** `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/components/NewProjectModal/NewProjectModal.tsx` driven by `apps/desktop/src/renderer/stores/add-repository-modal.ts`. Calls a different host service (`client.project.create`, ~line 146); empty/template marked "coming soon".
- **Shared submit logic:** `routes/.../new-project/hooks/useProjectCreationHandler/useProjectCreationHandler.ts` (lines 1–39) — navigates to `/project/$projectId` and invalidates `projects.getRecents` on success.
- **tRPC procedures:** `apps/desktop/src/lib/trpc/routers/projects/projects.ts`
  - `cloneRepo` (lines 1187–1341)
  - `createEmptyRepo` (lines 1343–1402)
  - `openNew` (lines 1064–1180+) — used by "Open existing folder", not by the new-project tabs
  - Helpers: `initGitRepo` (110–140), `upsertProject` (142–173), `ensureMainWorkspace` (175–253)

## Side-by-side: what each tab actually does

| Step | CloneRepo | EmptyRepo | Template |
|---|---|---|---|
| tRPC procedure | `projects.cloneRepo` | `projects.createEmptyRepo` | `projects.cloneRepo` (same) |
| Disk op | `git clone` | `mkdir -p` + `git init` + empty commit | `git clone` |
| Insert `projects` row | yes | yes (via `upsertProject`) | yes |
| `ensureMainWorkspace()` | yes | yes | yes |
| Cleanup on failure | **no** — orphan clone left on disk | yes — `rm` the dir if `initGitRepo` throws (line 1377) | **no** (uses cloneRepo) |
| Validate git user.name / user.email | **no** | yes (in `initGitRepo`, throws with message) | **no** |
| Run `bun install` / detect framework | no | no | no |
| Seed `.env` / `.superset/setup.json` | no | no | no |
| Run any post-clone or template script | no | no | no |
| Auto-open project (`navigate(replace:true)`) | yes | yes | yes |

## Clone-from-git: what it doesn't do

Compared to a "complete" clone you'd reasonably expect, and compared to the v2 workspace-init pipeline (`utils/workspace-init.ts`):

1. **No install step.** Workspace-init has an explicit `installing` step; project-create has nothing. After clone, project opens without `node_modules`.
2. **No setup-script execution.** `loadSetupConfig()` / `initialCommands` (used by `workspaces.create`) are not wired into `projects.cloneRepo`. Repos with `.superset/setup.json` are silently ignored at project-create time.
3. **No `.superset` config or env seeding.** Workspace creation copies `.superset` config into the worktree (`copySupersetConfigToWorktree`); project creation never bootstraps anything in the cloned repo.
4. **No partial-failure rollback.** `git clone` succeeds → project insert or `ensureMainWorkspace` fails (`projects.ts:1308–1320`) → cloned dir orphaned with no DB row. Re-trying the same URL hits the existing-dir branch and silently re-uses the orphaned dir.
5. **No git-user preflight.** EmptyRepo blocks if `user.name`/`user.email` are unset; CloneRepo doesn't, so the first commit attempt inside the cloned repo fails on a fresh machine.
6. **`defaultBranch` captured once at clone time.** No re-sync if remote default changes later.
7. **`ensureMainWorkspace` failures are `console.warn` + early return** (`projects.ts:234–237`). Project row exists, no workspace row, navigation succeeds → broken project page. Same anti-pattern as the "no access-gating stubs" rule: page should render and degrade where the workspace is actually needed, not silently swallow an insert error.
8. **No cancel.** Closing the tab or navigating away during clone doesn't kill the git process; the mutation just orphans.

## Implicit / derived states (no FSM)

State is reconstructed at runtime from four independent sources:

- `mutation.isPending` per tab — three siloed loading flags.
- Page-level `error` string (shared, `page.tsx:128–140`), but no shared `working` flag.
- `cloningTemplate: string | null` (TemplateTab only).
- Disk truth: does the dir exist?
- DB truth: is there a `projects` row? a `workspaces` row?
- Settings truth: is this project the active one?

### Illegal / unreachable states this allows

- **Dir exists, no `projects` row** (clone succeeded, insert failed). Recovery path partially handles only the inverse case (`projects.ts:1267+` deletes a stale row when the dir is missing).
- **`projects` row exists, dir missing.** Handled lazily on next open, not at create time.
- **`projects` row exists, no `workspaces` row** — `ensureMainWorkspace` swallowed the insert error.
- **Two tabs mid-mutation simultaneously** — both fire, both navigate, last wins. Nothing prevents tab switching while a mutation is in flight.
- **Template re-clone into existing dir** — silent re-use; user thinks they got a fresh template.
- **Re-clone same URL after partial failure** — duplicate-detection branch (`projects.ts:1250–1289`) updates `lastOpenedAt` and returns the existing project, hiding the corrupt state.

## Failure modes that leak partial state

1. Clone OK, DB insert fails → orphan clone dir. No cleanup.
2. `git init` OK, `git config user.email` unset → empty commit fails inside `initGitRepo`. EmptyRepo cleans up; CloneRepo path doesn't validate at all.
3. `ensureMainWorkspace` insert fails (non-conflict schema error) → `insertResult` empty → `wasExisting=true` (line ~206) → fetch returns null → `console.warn`, no error to caller. Project row exists with no workspace.
4. Tab switch mid-mutation → callback still navigates away from whichever tab won.
5. App quit / reload mid-clone → no resume, no GC, no marker that the dir is incomplete.

## Surface inventory and consolidation

There are **two project backends** living side-by-side in v2, and surfaces are split between them:

### Backend A — `electronTrpc.projects.*` (direct local IPC → SQLite)
Procedures live in `apps/desktop/src/lib/trpc/routers/projects/projects.ts`. Writes the local desktop DB directly. Knows nothing about the host service.

### Backend B — `client.project.*` (host-service client, `getHostServiceClientByUrl` + `useLocalHostService`)
The host service is the per-machine local Superset orchestrator (`LocalHostServiceProvider` wraps `_authenticated/layout.tsx:203`). Owns the canonical project model used by v2 cloud features.

### Surface table

| Surface | Path | Backend | Status | Reachable from |
|---|---|---|---|---|
| `/new-project` page (Clone tab) | `routes/_authenticated/_onboarding/new-project/components/CloneRepoTab/CloneRepoTab.tsx` | A — `projects.cloneRepo` | live, complete | StartView "New project", WorkspaceSidebarFooter "New project" |
| `/new-project` page (Empty tab) | `.../EmptyRepoTab/EmptyRepoTab.tsx` | A — `projects.createEmptyRepo` | live, complete | same |
| `/new-project` page (Template tab) | `.../TemplateTab/TemplateTab.tsx` | A — `projects.cloneRepo` (with template URL) | live, complete | same |
| `NewProjectModal` (clone tab) | `routes/_authenticated/_dashboard/components/AddRepositoryModals/components/NewProjectModal/NewProjectModal.tsx:146` | B — `client.project.create` | live | DashboardSidebarHeader dropdown "New project" |
| `NewProjectModal` (empty tab) | same file | — | **dead — disabled "(coming soon)"**, line ~53 | same |
| `NewProjectModal` (template tab) | same file | — | **dead — disabled "(coming soon)"**, line ~60 | same |
| `useFolderFirstImport` ("Import existing folder") | `.../AddRepositoryModals/hooks/useFolderFirstImport/useFolderFirstImport.ts:74,95,105` | B — `client.project.findByPath / setup / create` | live, complete | DashboardSidebarHeader dropdown "Import existing folder" |
| `useOpenProject` (open existing local folder) | `renderer/react-query/projects/useOpenProject.tsx` calling `electronTrpc.projects.openNew / openFromPath / initGitAndOpen` | A | live, complete | StartView, WorkspaceSidebarFooter, drag-drop |
| `add-repository-modal` Zustand store | `renderer/stores/add-repository-modal.ts` | n/a — single boolean + `openNewProject` action | live, trivial wrapper | DashboardSidebarHeader |
| `V2ProjectSettings` / `ProjectLocationSection` | `routes/_authenticated/settings/v2-project/$projectId/...` | B — `client.project.get / setup / findBackfillConflict` | live, complete | settings route |

### What this means

- The **same user-visible feature ("create new project") goes to two different backends** depending on whether they entered through `/new-project` (Backend A, local-only) or the dashboard sidebar dropdown (Backend B, host-service). A project created via Backend A may not show up correctly in v2 settings (which read from Backend B). This is the real bug surface, not just the duplication.
- `NewProjectModal`'s empty + template tabs are **stubbed dead code** with `disabled` props and "(coming soon)" labels — they are not behind a flag, just literally unimplemented.
- `useFolderFirstImport` is a **complete** Backend-B path that already does what `NewProjectModal` half-does (it can create a project, link an existing folder, or set up an existing project). It overlaps with `NewProjectModal`'s clone case.
- `V2ProjectSettings` editing the project location uses **Backend B exclusively**, which strongly suggests Backend B is intended to be the source of truth in v2.

### Triage

**Keep:**
- The `/new-project` page UI as the canonical full-page entry. It has the right shape (three tabs, shared error, shared parentDir picker).
- `useOpenProject` hooks — solid abstraction for opening existing folders, used by multiple surfaces.
- `useFolderFirstImport` — complete Backend-B import path; this is the model the create-flow should follow.
- `LocalHostServiceProvider` and `client.project.*` — Backend B is what v2 settings already use; this is the direction.

**Consolidate (rewire to Backend B):**
- `projects.cloneRepo`, `projects.createEmptyRepo`, `projects.openNew` should either go through the host service (`client.project.create` + `client.project.setup`) or the host service should be the only writer and these IPC procedures should be removed. The `/new-project` tabs should call `client.project.*` the way `useFolderFirstImport` already does.
- `add-repository-modal` Zustand store collapses into local component state in `DashboardSidebarHeader` — it's one boolean.

**Delete:**
- `NewProjectModal` entirely. Its clone path is a worse, partial duplicate of `/new-project`'s Clone tab; its empty and template tabs are dead disabled stubs. Replace the dashboard sidebar "New project" dropdown item with a link to `/new-project` (StartView and WorkspaceSidebarFooter already do this).
- The `add-repository-modal` store along with it.

**Decision (2026-04-29):** Everything goes through the host service. Backend A (`electronTrpc.projects.*`) is legacy and will be deleted.

## Transaction principle: cloud is reality

- **Create:** local first, cloud LAST. Cloud-create is the commit point.
- **Delete:** cloud FIRST, local last. Cloud-delete is the kill point.
- **Rollback during create:** since cloud is last, any failure is pre-commit — clean up local, cloud never knew. There is no "cloud succeeded, local didn't" half-state.
- **Rollback during delete:** if cloud-delete fails, abort and leave local intact — user retries. If cloud-delete succeeds and local cleanup fails, that's stale local data — recoverable via a sweep, not catastrophic.

This inverts the current `createFromClone` ordering (`packages/host-service/src/trpc/router/project/handlers.ts:99–141`), which does `clone → cloud → localDB → mainWorkspace` and keeps the clone if anything after cloud fails. The new flow eliminates that recovery tail.

### New create pipeline (all four modes: clone, empty, template, importLocal)

> **Constraint discovered during planning:** `v2Workspaces.projectId` has a NOT NULL FK to `v2Projects.id` (`schema.ts:529-531`). So `v2Workspace.create` cannot run before the cloud project exists. The naive "cloud last" ordering would FK-violate. The pipeline below works around this — the **saga as a whole** is the commit unit, even though there are now two cloud writes within it.

```
1. Local file ops      (clone / mkdir+git init / template clone+strip / verify existing)
   on fail → nothing to roll back

2. Local DB project    (insert desktop project row with client-supplied UUID)
   on fail → rm -rf step 1 dir

3. Cloud v2Project.create   (cloud project row appears, but saga not yet "real")
   on fail → delete step 2 row, rm -rf step 1 dir

4. Cloud v2Workspace.create + local workspace row    (ensureMainWorkspace strict variant)
   on fail → cloud v2Project.delete (rollback commit), delete step 2 row, rm -rf step 1 dir
   NOTE: existing ensureMainWorkspace is log-and-continue; create flow uses a strict variant.
         The lenient version stays for the startup sweep.
```

**On full-success:** the saga is the commit unit. From the user's perspective the project either fully exists everywhere (cloud project + cloud workspace + local row + local workspace + on-disk repo) or doesn't exist at all. No half-state is visible to the UI.

**Existing v2 project-delete (`project.remove`) also needs rework** to match Decision 1 + 5 (cloud first, never auto-rm).

### Implication: client-supplied project IDs

Steps 2 and 3 need a project id before cloud has minted one. The host service must generate a UUID locally and pass it to `v2Project.create`. This requires a small API change:

- **Cloud (`apps/api`):** `v2Project.create` accepts an optional `id: string (uuid)` input, validates uniqueness, uses it instead of generating one. Ships before desktop per deploy-ordering memory.
- **Host service:** generate UUID at the top of each create handler, thread it through `persistLocalProject` + `ensureMainWorkspace` + `v2Project.create`.

### New delete pipeline

```
1. Cloud v2Project.delete   ← kill point
   on fail → abort, local untouched, surface error to user

2. Local DB rows deleted   (project + workspaces + ...)
   on fail → log, leave dir on disk; reconciliation job handles strays

3. Filesystem dir          (typically NOT auto-removed; explicit user opt-in)
```

## Cloud-side prerequisites (decided 2026-04-30)

These ship before any desktop work, per deploy-ordering rule.

### PR 1 — `v2Project.delete` → `jwtProcedure`

**Current state:** `v2-project.ts:376-386` uses `protectedProcedure` (session-only). Its only caller (`DeleteProjectSection.tsx:34`) uses `apiTrpcClient`, which is JWT-only — so the existing UI is unreachable today (latent bug).

**Changes:**
- Convert procedure to `jwtProcedure`.
- Input: `{ organizationId: uuid, id: uuid }`.
- Org check: `ctx.organizationIds.includes(input.organizationId)` → 403 otherwise (matches `create`/`get` pattern).
- Idempotent on missing project: catch the NOT_FOUND from `getScopedProject` and return `{ success: true }`. Any other error (auth, DB) propagates.
- Cascade is already handled at the schema level (`schema.ts:529, 719` — `onDelete: "cascade"`).

**Caller fixup:**
- `DeleteProjectSection.tsx:34`: pass `organizationId` alongside `id`. Source it from the project row (already loaded one level up via `v2Project.get`).

### PR 2 — `v2Project.create` accepts `id?`

**Current state:** `v2-project.ts:159-218`. DB column already has `defaultRandom()` (`schema.ts:395`); no migration needed.

**Changes:**
- Input schema: add `id: z.string().uuid().optional()`.
- Insert: spread `...(input.id ? { id: input.id } : {})` into `.values(...)`.
- Map PK unique-constraint violations to `TRPCError CONFLICT` so the host service can retry with a fresh UUID (symmetric with the slug-retry pattern in `handlers.ts:43-75`).

### Landing order

1. PR 1 first (`delete` → JWT) — also fixes the dormant DeleteProjectSection UI.
2. PR 2 second (`create` `id?`) — purely additive, no callers to migrate.
3. Desktop work follows once both are live.

### Rollback-of-rollback policy

Any rollback step can itself fail. Rule: log loudly, never silently swallow. Failures of local rollback during a create-error keep returning the original create error to the caller; the orphan local state is picked up by a startup reconciliation sweep (or a manual "Project not in cloud" cleanup action — TBD design).

## Original consolidation plan — DEPRECATED

> The original audit prescribed rewiring `/new-project` tabs, replacing
> `useOpenProject`, deleting `electronTrpc.projects.*`, and pointing the
> v2 dashboard dropdown at `/new-project`. After the 2026-04-30 incident
> (see ⚠️ Hard constraint at the top), all of those touch v1-reached
> code and are forbidden. The **Locked-in decisions** section above is
> the authoritative plan.
>
> This section is left collapsed for historical context only. Do not
> use it as a guide.

## File reference index

| Component | Path | Lines |
|---|---|---|
| New-project page | `apps/desktop/src/renderer/routes/_authenticated/_onboarding/new-project/page.tsx` | 1–146 |
| CloneRepoTab | `.../new-project/components/CloneRepoTab/CloneRepoTab.tsx` | 1–67 |
| EmptyRepoTab | `.../new-project/components/EmptyRepoTab/EmptyRepoTab.tsx` | 1–68 |
| TemplateTab | `.../new-project/components/TemplateTab/TemplateTab.tsx` | 1–143 |
| Shared post-create handler | `.../new-project/hooks/useProjectCreationHandler/useProjectCreationHandler.ts` | 1–39 |
| Parallel modal flow | `.../AddRepositoryModals/components/NewProjectModal/NewProjectModal.tsx` | — |
| Modal store | `apps/desktop/src/renderer/stores/add-repository-modal.ts` | — |
| `projects.cloneRepo` | `apps/desktop/src/lib/trpc/routers/projects/projects.ts` | 1187–1341 |
| `projects.createEmptyRepo` | same | 1343–1402 |
| `projects.openNew` | same | 1064–1180+ |
| `initGitRepo` | same | 110–140 |
| `upsertProject` | same | 142–173 |
| `ensureMainWorkspace` | same | 175–253 |
