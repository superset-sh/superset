# Local-first projects

Decided 2026-07-16: v2 goes **fully local**. Projects live in host.db only;
the workspace cloud dual-write retires too. Cloud comes back later as its own
product entity — team-created cloud projects that support sandboxes etc. and
link to local projects. **We do not design that now**; we only guarantee it
can be added without migrations of local data.

Supersedes the 07-12 draft and the auto-mirror revision of this doc. The
mechanics built in worktree `local-first-cloud-promoti` (P0–P2: cloud push,
reconciler, park/join dialog) are superseded except the local-commit path.

**Done looks like:** network off, forever — create a project from a folder,
rename it, create workspaces, no errors, no parked rows, no sync spinners.
`my-app-2` dupes (#5649) are structurally impossible: nothing touches the
cloud on create.

## Now

- **Host schema**: `projects` gains `name`, `updatedAt` (drizzle-kit).
  One-time backfill: name from cloud row if reachable, else folder basename;
  never blocks startup.
- **Create path**: `persistFromResolved` drops the blocking cloud create +
  rollback — local insert is the commit point. Import = local create, always.
- **Host router**: `project.list` / `project.update` / `project:changed` on
  the existing bus. Bare `protectedProcedure`; relay stays the authz boundary.
- **Renderer**: `useHostProjects` fan-out (workspace pattern: `networkMode:
  "always"`, event-patched cache, 30s heal). Sidebar + settings move off
  Electric `v2Projects`.
- **Workspace sync retires**: `workspace-cloud-sync.ts` + backfill stop
  pushing; Electric `v2Workspaces`/`v2Projects` merge sources removed from
  desktop. Local `cloudSyncedAt`-style fields don't get added at all.
- **Cloud tables freeze**: `v2_projects` / `v2_workspaces` and their
  endpoints stay up for old clients during the mixed-version window, take no
  new writes from new clients, and are retired on adoption telemetry.

Consumers currently reading cloud rows that need a migration story before the
freeze bites (audit before build): mobile home/filter/new-chat screens,
automations router, task→workspace dispatch, web workspace views. Mobile
loses workspace visibility until either relay-backed host fan-out or the
future cloud layer — accepted trade-off of this decision.

## Future seam — invariants that keep cloud addable

1. **Local ids are stable and never re-keyed** (uuid-shaped, globally
   unique). The future entity references them; nothing ever renumbers them.
2. **The link will be one nullable column** (`cloudProjectId` on the host
   row) added *when the entity ships* — not now ("no fields without
   consumers"). Identity = that explicit link; never URL or slug matching.
3. **Everything that groups projects goes through a function** (today
   `p.id`), so a second key can be swapped in without hunting raw-id usage.
4. **Host rows keep their own repo coords** (PR/CI works offline, no cloud
   dependency); the future entity carries canonical coords and team surfaces
   read those.
5. **Adding sync later is additive dual-write** — the proven workspace R1
   pattern (inline push + reconciler + LWW) applies unchanged because the
   host stays authoritative for everything it owns today.

Future-entity notes (recorded, not designed): org-owned with nullable
`team_id` (teams are grouping, not ACL — `20260510-teams-model.md`); created
explicitly by teams; owns org-facing name/slug; supports sandboxes; links
down to local projects per user/machine.

## Deploy & safety

Desktop-only change in substance; cloud work is freezing, not migrating.
Old clients keep working against the frozen endpoints. Nothing destructive.
Acceptance: Wi-Fi-off cold-boot drill (process-kill drills don't exercise
`navigator.onLine`) + create/rename/delete/workspace-create offline.

## Decision log (2026-07-16 walkthrough)

| # | Decision | Choice |
|---|---|---|
| 1 | Future entity ownership | Org-owned, nullable `team_id` |
| 2 | Mirror visibility | Moot — no mirrors; cloud visibility only via future entity |
| 3 | #5649 fix | No standalone fix — local-only create kills it structurally |
| 4 | GitHub coords | Both layers; future entity's are canonical for team surfaces |
| 5 | Workspace cloud sync | Retires with projects — v2 fully local until cloud layer returns |
