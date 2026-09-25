# #7100: remote-host worktrees never get a sidebar row

## 1. Mechanism
Sidebar rows are built only from per-device `v2WorkspaceLocalState` records joined to host data (`useDashboardSidebarData`). `useHostWorkspacesSource` already fans out to every known host, so a remote worktree is in memory, but the only reconciler that mints local rows for CLI/automation-created worktrees (`usePlaceLocalWorktreesInSidebar`) filtered `hostId === machineId`. Clicking the workspace calls `ensureWorkspaceInSidebar` with no host check, which is why the row appears and sticks after step 5 of the repro. `removeProjectFromSidebarState` had the same machine-only filter for row-less tombstones, so widening placement alone would make "remove project" undo itself when a remote host answered.

## 2. Files changed
- `components/AgentHooks/hooks/usePlaceWorktreesInSidebar/` (renamed from `usePlaceLocalWorktreesInSidebar/`): hook now maps every host's rows with `hostId` + `hostReachable`, derives `onlineHostIds` from `useKnownHosts`, and passes both to the selector.
- `.../selectWorktreesToPlace.ts`: pure host gate added (`{ machineId, onlineHostIds }`), type renamed `WorkspaceForPlacement`.
- `components/AgentHooks/AgentHooks.tsx`: import/call renamed.
- `hooks/useDashboardSidebarState/sidebarMutations.ts`: `removeProjectFromSidebarState` takes a `SidebarPlacementScope` (machineId + currentUserId) and tombstones row-less worktrees on every host the reconciler could place from: local host, or remote worktrees this user created. Teammates' rows get no tombstone.
- `hooks/useDashboardSidebarState/useDashboardSidebarState.ts`: call site updated, `machineId` no longer destructured.

## 3. Gating and lifecycle
- Local host: always placed (serves from snapshot at boot; unchanged behaviour).
- Remote host: placed only if presence-merged `isOnline` AND `hostReachable` (host answered `workspace.list` this session) AND `createdByUserId` is the signed-in user (see §7). Both are needed: react-query retains rows after a host goes offline, and an online host serves IndexedDB snapshot rows before it answers.
- Dismissed rows: `placedWorkspaceIds` (any existing local row, hidden or not) is host-agnostic, so a hidden/removed remote row is never re-placed.
- Remote deletes: from this device, `removeWorkspaceFromSidebar` deletes the row for any host. Deleted elsewhere, the host list drops it and the join hides the orphan row (existing behaviour; no GC, known follow-up).
- Cloud sandbox rows are not placed (sandbox host id is not in the org host list).

## 4. Tests and commands
- `selectWorktreesToPlace.test.ts`: 8 remote-host cases (online placed, offline skipped, snapshot-only skipped, retained-after-offline skipped, failed relay skipped, local unreachable still placed, dismissed remote respected, sandbox ignored). 5 failed before, pass after.
- `sidebarMutations.test.ts`: remove-project tombstones row-less worktrees regardless of host. 2 failed before, pass after.
- `sidebarVisibility.test.ts` (new): locks remote mains out of auto-include; passes before and after (guard).
- `cd apps/desktop && bun test src/renderer/routes/_authenticated/components/AgentHooks/hooks/usePlaceWorktreesInSidebar src/renderer/routes/_authenticated/hooks/useDashboardSidebarState src/renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal` → 62 pass, 0 fail (4 files).
- `bun run typecheck` (repo root) → 39/39 tasks successful, exit 0.

## 5. CDP verification
Yes, in this worktree's dev app (CDP :9611, vite :4725). Seeded two fake hosts into the worktree's Neon branch via the real `v2Host.list` path. Online host with failing relay: snapshot rows not placed. Simulated it answering (`setQueryData` on its workspace-list key): worktree placed under Superset with the remote icon, no click. Offline host handed retained rows: not placed. Hidden row + host re-answer: not re-placed. Synthetic host answer, real pipeline otherwise. Screenshot: `/private/tmp/claude-501/-Users-kietho--superset-worktrees-1c99c8eb-1b31-4f04-9ac4-61a2760c74b6-fix-7100-remote-host-sidebar-rows/14cb8895-bd5c-4f07-99cc-58f95ef8bc34/scratchpad/after_sidebar_clip.png`. Fake data cleaned up, stack stopped. Note: `.env` needed R2/Cloudflare placeholders for the API to boot.

## 6. sidebarVisibility.ts
Unchanged on purpose. `isAutoIncludedLocalMainWorkspace` stays local-only: auto-including remote mains would add a second "main" row per project per online host, and sidebar DnD/sort assume one local main. Remote mains remain opt-in via Workspaces → Pin. The new test documents this.

## 7. Follow-up decided 2026-09-02: gate remote placement on the workspace creator
Placing every online accessible host's worktrees pins teammates' work on shared hosts. Owner (a `v2_users_hosts` role on a host) is the wrong key; creator (`created_by_user_id` on the workspace) is right, but no create path recorded it: the host's request context had no user (this host.db: 324 worktrees + 87 sessions since July, 0 with a creator). Step 1, done here, records it via one header, `x-superset-user-id` (`SUPERSET_USER_ID_HEADER` in `@superset/shared/host-routing`):
- `buildUpstreamHeaders` in `@superset/shared/host-routing` (+test), used by both `apps/relay` and `apps/relay2`: sets it from the verified JWT `sub`, overwrites any client value, still strips host/authorization. Covers CLI-remote, MCP, SDK, automations (`mintUserJwt` = owner).
- `packages/host-service`: `HostServiceContext.userId` from the header (`app.ts`, CORS allow-list); stamped as `createdByUserId` in `workspaces.create` and `createSession`. Adopt/main paths stay null. No migration (column existed).
- Desktop: `setClientUserId` in `host-service-auth.ts`, wired from the session in `LocalHostServiceProvider`. CLI: local target reads `sub` from its JWT (`readJwtSubject.ts`, +test); API-key callers send none.
- Tests: `cd packages/shared && bun test src/host-routing.test.ts` → 2 pass; `cd packages/cli && bun test src/lib/host-target/readJwtSubject.test.ts` → 2 pass.
Step 2, done: `selectWorktreesToPlace` takes `currentUserId` (session via `authClient.useSession` in the hook) and places a remote worktree only when `createdByUserId === currentUserId`; null creator (older host) or unknown session → not placed, opt-in via Pin. Local host still places regardless of creator. Tests: teammate skipped, null creator skipped, session-unknown skipped, local-any-creator placed → 66 pass across the 4 sidebar files. Remote auto-placement therefore works only once both machines run the new version; before that, behaviour equals today.
