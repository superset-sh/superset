# Local-first projects — decisions & implementation reference

End-state map for PR #5731 (branch `local-first-projects-desi`). The design
rationale lives in `20260716-local-first-projects.md`; this doc records what
was decided and what actually shipped, with file pointers. Follows the
workspace precedent (`offline-first-workspace-table-reference.md`).

## Decisions (2026-07-16 walkthrough with Kiet)

| # | Decision | Choice |
|---|---|---|
| 1 | Scope | **v2 fully local.** host.db owns projects; no cloud mirror, no auto-sync. Cloud returns later as a team-created "cloud projects" entity (sandboxes) — not designed now, only kept addable. |
| 2 | Future entity | Org-owned, nullable `team_id` (teams are grouping, not ACL). Owns org-facing name/slug + canonical GitHub coords. Link = one nullable `cloudProjectId` column added to host rows **when the entity ships** — not before. |
| 3 | Workspace cloud sync | Retires with projects. Mobile loses workspace visibility until the cloud layer returns — accepted. |
| 4 | #5649 (`my-app-2` dupes) | No standalone fix — create never touches the cloud, so the slug walk can't happen. |
| 5 | GitHub coords | Host rows keep their own (PR/CI works offline); future entity's are canonical for team surfaces. |
| 6 | Identity invariants | Local ids stable, never re-keyed; identity = explicit link, never slug/URL matching; grouping always through a function (`projectKey`); re-adding sync later = additive dual-write (proven workspace R1 pattern). |

## What shipped — host-service

- **Schema** (`db/schema.ts`, migration `drizzle/0010_project_identity_fields.sql`):
  `projects` gains `name` (default `""` = not-yet-backfilled sentinel) and
  `updatedAt` (default 0). No cloud columns — "no fields without consumers".
- **Backfill** (`runtime/project-backfill.ts`, wired in `app.ts` before the
  workspace sweeps): fills sentinel rows once — legacy cloud row name if
  reachable, folder basename on confirmed NOT_FOUND, sentinel kept + retried
  next boot on transient errors. Update CASes on `name = ''` so a rename
  landing mid-lookup is never clobbered. Never blocks startup.
- **Store + events** (`projects/local-project-store.ts`, `events/types.ts`):
  `toProjectSnapshot` / `updateLocalProject` / `emitProjectChanged`;
  `project:changed` broadcasts (created/updated/deleted) carry a full
  snapshot (name, repoPath, repoOwner/Name, repoUrl, worktreeBaseDir) so
  event-patched caches don't lose fields. Client plumbing in
  `packages/workspace-client/src/lib/eventBus.ts`.
- **Create** (`trpc/router/project/handlers.ts`): saga is local-only —
  local row (host-minted UUID) → local main workspace; failure unwinds
  locally. Slug-retry machinery deleted.
- **Router** (`trpc/router/project/project.ts`): `list`/`get` serve identity
  fields with the basename fallback; `update` = local rename; `remove` checks
  local ownership first, then best-effort legacy cloud delete (never blocks,
  offline-capable); `findByPath` is local-only in the folder-first branch
  (`walkAllRemotes` v1-importer branch unchanged); `setup` has a local-first
  fast path — cloud lookup only when adopting a legacy cloud row onto a new
  device.
- **Workspace sync retirement**: `runtime/workspace-cloud-sync.ts` deleted
  (push, LWW, CAS, re-keying `relinkLocalWorkspaceId`, tombstone replay,
  60s reconciler). `local-workspace-store.ts` lost `cloudSyncedAt` writes and
  all tombstone helpers; `deleteLocalWorkspace` is delete+broadcast only.
  Push call sites removed from `ensure-main-workspace.ts`,
  `adopt-existing-worktree.ts`, `workspaces.ts` (`registerLocalWorkspace`),
  `workspace.ts` update, `ai-workspace-names.ts`. Host **registration** is
  untouched — `tunnel/connect.ts` still calls `host.ensure` (relay access).
  `workspace-backfill.ts` stays (read-only legacy name fill).
- **Guard test**: `projects/local-project-store.ts` added to the
  `no-snapshot-fields-for-queries` allowlist (display consumer, not query
  routing).

## What shipped — desktop renderer

- **`useHostProjects`** (`renderer/hooks/host-projects/useHostProjects/`):
  the project read path. Per-host `project.list` fan-out (local direct,
  remote via relay), `networkMode: "always"`, 30s background refetch,
  `project:changed` events patch the cache + persisted snapshot, IndexedDB
  last-seen snapshots per host. Deleted events also purge snapshots so a
  pre-hydration delete can't resurrect. Merge is a per-row union on `id`
  (legacy cloud-created projects share ids across hosts and collapse into
  one item; `projectKey` kept separate for the future link key).
- **Migrated off Electric `v2Projects`**: dashboard sidebar
  (`useDashboardSidebarData` — placement stays in localStorage
  `v2SidebarProjects`, identity joins in JS), settings list/detail pages,
  `V2ProjectSettings` (name/repo/thumbnail from host data; icons derive from
  the GitHub owner avatar; repository field read-only — derived from the git
  remote), new-workspace modal project picker.
- **Renames commit through the host** everywhere (settings `NameSection`
  seeded from the *targeted host's* `project.get` name with post-commit
  refetch; sidebar inline rename resolves a serving host). Optimistic cloud
  rename (`useOptimisticCollectionActions.renameProject`) no longer used by
  these paths.
- **`useEnsureV2Project`**: candidate → local setup; no candidate → local
  create. Dead NOT_FOUND fallthrough removed.

## Known gap — offline COLD BOOT (P0 follow-up, own PR)

Everything below verifies against a **running** app. A cold boot with
connections off never reaches the local-first world — the auth gate in
`routes/_authenticated/layout.tsx` blocks in all three offline flavors
(CDP-confirmed): blackholed API → `useSession` never resolves → splash
forever; interface down → the explicit "You're offline" wall; API down but
network up → redirect to /sign-in. Fix shape: persist
`lastActiveOrganizationId`, bounded session wait, proceed with cached
identity when a local token exists — risky (sign-in-loop history, #5729),
and many components read the org from `authClient.useSession` directly, so
it needs its own careful PR.

## Verification (2026-07-17)

885 host-service tests green (3 rewritten to the local contracts); tsc +
biome clean. CDP against the live dev app: migration+backfill on a real
host.db (28 rows; transient-error row filled on next boot); create 171ms
online with cloud NOT_FOUND; full offline lifecycle (API SIGSTOP +
`navigator.onLine=false`): create 179ms / rename 18ms / workspace 379ms /
sidebar 101ms, nothing hung; settings + NameSection e2e; deletes ~100ms with
legacy-cloud failure swallowed; zero push/reconciler log lines all session.

## Deliberately NOT done (tracked follow-up)

- ~15 secondary desktop surfaces still read frozen Electric `v2Projects`
  (task filters, command palette, history, automations hooks, presets).
- Electric `v2Workspaces` merge source still in the desktop workspace path.
- Freeze audit before cloud tables retire: mobile screens, automations
  router, task dispatch (automations can't target local-only projects yet).
- Unique index on `projects.repoPath` (needs dedup migration); serving-host
  `hostId` in settings navigation; custom icon upload (retired with the
  cloud row — future entity concern).
