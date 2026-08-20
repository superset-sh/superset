# Optional-Project Workspaces ("Sessions") + Universal Sidebar Grouping

## Context

Today every workspace must belong to a project (a git repo on a host); there's no home for general/scratch agent work. We're making the project **optional**: a project-less workspace — a **session** — gets a real managed folder at `~/.superset/sessions/<name>`, git-init'd by default, so terminals/chat/agents/changes-panel all keep working. Separately, sidebar "sections" generalize into a **nestable grouping tree** (organizational only — no filesystem/git parent-child), usable inside projects and at root level for sessions.

Precedent: the unmerged `origin/sidebar-freeform-sessions` branch proved chat/terminal layers are workspace-optional but skipped folders/git entirely (shared `~` cwd, no Diff tab). This design supersedes it for desktop: a session is a real workspace row with an isolated repo. Future win it enables: **promote-to-project** = `project.create(importLocal)` on the session dir.

## Locked decisions (with Kiet)

1. Session = workspace with `projectId: null`, `type: 'session'`, folder `~/.superset/sessions/<name>`, git init + initial commit by default.
2. Host.db `workspaces.projectId` becomes nullable. Cloud v2 tables are frozen (local-first) — **no cloud schema change; sessions never dual-write to cloud**.
3. Dedicated creation procedure `workspaces.createSession` — NOT threaded through the 675-line `workspaces.create`.
4. Nesting = organizational grouping only: the existing sections become a universal tree (`parentSectionId`, nullable `projectId` — see Phase C notes), renderer localStorage. Projects stay top-level rows (not nestable).
5. Sidebar gets a **Sessions** root section alongside Pinned and Projects.
6. Out of scope: v1 desktop UI, cloud schema, automations targeting sessions (cloud `automations.v2ProjectId` NOT NULL — follow-up), tasks.

## Phases (each independently shippable; merge order A → (B ∥ C1) → C2 → D)

### Phase A — host-service: schema + session lifecycle

**Schema** — `packages/host-service/src/db/schema.ts`
- `workspaces.projectId` (L204-206): drop `.notNull()`, keep FK.
- `type` (L225): widen to `"main" | "worktree" | "session"`.
- `workspaces_one_main_per_project` partial index (L245-247): untouched (only applies `WHERE type='main'`; SQLite treats NULLs as distinct anyway).
- Migration: edit schema.ts only, then **ask Kiet to run `drizzle-kit generate`** (never hand-edit `drizzle/`; see `.agents/skills/db-migrations/SKILL.md`).

**Wire types + store**
- `src/events/types.ts` L61-72: `WorkspaceSnapshot.projectId: string | null` + type widening → let compile errors surface every consumer.
- `src/workspaces/local-workspace-store.ts`: `InsertLocalWorkspaceValues.projectId: string | null`; **leave `CloudShapedWorkspace` as-is** and gate every `toCloudShape` / legacy cloud-write / `workspace_cloud_deletes` call site with `type === "session"` → skip.

**New files**
- `src/trpc/router/workspace-creation/shared/session-paths.ts`: `defaultSessionsRoot()` = `~/.superset/sessions`; `safeResolveSessionPath()` traversal guard (mirror `worktree-paths.ts:41-58`).
- `src/trpc/router/workspace-creation/procedures/create-session.ts` (follows `adopt.ts` pattern), registered as `workspaces.createSession`:
  - Input: `{ id?, name?, agents?, command? }`. Output: `{ workspace, agentResults?, warnings }`.
  - Steps: name via `generateFriendlyBranchName()` (`packages/shared/src/workspace-launch/friendly-branch-name.ts`) → folder name deduped via `deduplicateBranchName` (`utils/sanitize-branch.ts:18-41`) against dirs + rows → mkdir → git init + `--allow-empty` initial commit (extract the init body of `initLocalRepoInPlace`, `router/project/utils/resolve-repo.ts:217-237`, into a shared helper — don't call it, it creates a project) → `insertLocalWorkspace({ projectId: null, branch: "main", type: "session", ... })` → optional agents/command via the same launch helpers `create` uses.
  - Skip setup scripts (fresh empty repo has no `.superset/config.json`).

**Destroy** — `src/trpc/router/workspace-cleanup/workspace-cleanup.ts` (`runDestroy` L204-416)
- Add explicit `type === "session"` branch **before** the existing `local && !project` branch (L307-314, which would otherwise warn and leak the dir).
- Dirty preflight unchanged (works off `worktreePath`). Teardown script: skip. PTY disposal: unchanged. Worktree phase → **`rm -rf` in worker pool** with hard guard: resolved path must be strictly under `defaultSessionsRoot()`, else typed error. Skip cloud delete + branch delete.
- `inspect` and `is-main-workspace.ts` verified tolerant; confirm project-null path.

**Runtime sweeps**
- PR runtime `runtime/pull-requests/pull-requests.ts`: `isNotNull(projectId)` on row sweeps + early return for null.
- Verify-no-op (they key off `worktreePath`): terminal.ts L1319-1412, runtime/chat/chat.ts L454-461, chat-v3/resolveCwd.ts, app.ts L157-166, `git.getBaseBranch` (null OK).
- Untouched: `requireLocalProject` callers (create L512, L1231, adopt, list-project-worktrees) keep requiring a project.
- Rename: `workspace.update` name-only — works; folder name frozen (same contract as worktrees).

**Tests**: new `test/integration/session-create-delete.integration.test.ts` modeled on `workspace-create-delete`: create → dir + initial commit + row shape; terminal cwd resolves; dirty → destroy CONFLICT; force → dir gone; name collision dedups; traversal rejected; zero cloud calls. Rerun workspace-cleanup + pull-requests suites.

### Phase B — renderer: sessions render, create, delete (v2 only)

**Nullable projectId in local state** — `CollectionsProvider/dashboardSidebarLocal/schema.ts`
- `sidebarState.projectId` (L126) → `z.string().uuid().nullable()` — **no `.default(null)`** (stays an identity field; widening is backward-compatible: old string rows parse, no version bump, no heal change; do NOT map undefined→null in heal — that would reparent corrupt rows into Sessions).
- Verify `v2WorkspaceLocalState` index on `sidebarState.projectId` (collections.ts ~L810) tolerates null keys.
- `HostWorkspaceItem` (`useHostWorkspaces.utils.ts:16`): redefine locally as `Omit<SelectV2Workspace, "projectId"|"type"> & { projectId: string | null; type: ... }` (cloud type is frozen).

**Drop-site fixes** (sessions currently vanish at 5 sites)
1. `buildDashboardSidebarProjects.ts:207-209` — partition session rows out upstream in `useDashboardSidebarData.ts` into a new `sessionWorkspaces` output.
2. Pinned drop (`:130-132`) — allow null-project when `type === "session"`; nullable `projectName` on `DashboardSidebarPinnedWorkspace`.
3. `useVisibleSidebarWorkspaceIds` — null projectId ⇒ always visible (no sidebar-project row needed).
4. `useAccessibleV2Workspaces.ts:344-345` + `V2WorkspacesList.groupByProject` + `ProjectFilterTriggerLabel` — include null-project rows under a "Sessions" group/filter.
5. `getFlattenedV2WorkspaceIds` — include sessions list for keyboard nav (⌘1-9).

**Sidebar**
- `DashboardSidebar/types.ts`: `projectId: string | null`, type adds `"session"`.
- New `DashboardSidebar/components/DashboardSidebarSessionsSection/` (folder convention: component + index.ts), rendered in `DashboardSidebar.tsx` near L263-273, flat list in Phase B, "New session" affordance in header.
- `useDashboardSidebarState.ensureWorkspaceInSidebar` accepts null projectId; add `reorderSessionWorkspaces`.

**Create + delete UX**
- `ProjectPickerPill` gains "No project — Session" option; `useSubmitWorkspace.ts:37-40` gate relaxed: null project ⇒ `workspaces.createSession` (branch/PR fields disabled in that mode).
- `stores/new-workspace-modal.ts` `PendingWorkspace.projectId: string | null`; `useWorkspaceCreates.submit` branches on null (host call seam L141-143); optimistic row + `writeWorkspacePaneLayout` write `projectId: null`.
- Delete dialog: hide "delete branch" checkbox for sessions; copy says folder is deleted.

**Tests**: builder unit tests (partition, pinned session, visibility, flatten order); schema test parsing a captured pre-change row + a null row. CDP: create session → appears under Sessions → terminal cwd `~/.superset/sessions/<name>` → edit file → Changes panel shows diff → rename → delete → dir gone.

### Phase C — universal grouping tree

Ships in a separate stacked PR (branch `nested-workspace-groups`). This PR keeps
sections flat and project-scoped; sessions render as a flat list.

### Phase D — CLI / MCP / SDK (any time after A)

- Omitting `projectId` ⇒ session (one mental model): `packages/mcp/src/tools/workspaces/create.ts:29`, `packages/cli/src/commands/workspaces/create/command.ts:11` (drop `.required()`), `packages/sdk/src/resources/workspaces.ts:145`. Reject branch/pr/baseBranch inputs when projectId omitted, with a clear error. Lists render `projectName ?? "session"`.

## Risk register (top items)

| Risk | Mitigation |
|---|---|
| localStorage heal drops rows on schema widening | Widening-only (`.nullable()`, no default); unit test with captured pre-change row |
| Consumers assume `WorkspaceSnapshot.projectId: string` | Type change forces compile errors; grep sweep before merging A |
| Destroy saga leaks session dirs via `local && !project` branch | Explicit session branch ordered first; test asserts dir removal |
| `rm -rf` on corrupt `worktreePath` | Hard guard: path must be under `~/.superset/sessions` |
| Sessions dual-written to frozen cloud tables | Gate every cloud call site on type; test asserts zero cloud calls |
| PR runtime NPE on null projectId | `isNotNull` filters + early return + integration test |
| Group cycles freeze tree builder | Visited set + depth cap on read; descendant check on write |

## Verification (end-to-end)

- Per-phase tests above; `bun run lint` clean (CI fails on warnings) + `bun run typecheck` before each push.
- Full CDP journey after B (per repo CDP rules — verify worktree/port/session first): create session from modal, run agent + terminal in it, dirty the folder, confirm Changes panel, delete with dirty-confirm, verify folder removed and no orphan localStorage rows.
- After C: drag/nest/collapse/restart persistence checks.

## Follow-ups (explicitly deferred)

- Promote session → project (`project.create(importLocal)` on session dir).
- Automations targeting sessions (needs cloud `automations.v2ProjectId` nullable — Phase D of plans/remove-cloud-project-model.md).
- Setup scripts for sessions if users want `.superset/config.json` in session folders.
