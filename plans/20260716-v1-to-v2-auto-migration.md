# v1 → v2 Seamless Auto-Migration & v1 Sunset

Goal: silently move every remaining v1 desktop user onto v2 — no wizard, no banners, no empty states — then delete v1.

## Current state (verified in code, post local-first merge 2026-07-19)

- **The v1/v2 switch is 100% client-local.** `useIsV2CloudEnabled` (`apps/desktop/src/renderer/hooks/useIsV2CloudEnabled.ts`) resolves `optInV2 ?? (isV2OnlyUser(createdAt) || dev)`. `optInV2` lives in localStorage (`v2-local-override-v2`); an explicit `false` (user tried v2 and switched back) wins over everything. No server flag — migration ships in a desktop release.
- **All migration machinery already exists — it's just manual.** The `V1ImportModal` wizard (Experimental Settings → "Import from v1") reads v1 local.db via the `migration` router (`apps/desktop/src/lib/trpc/routers/migration/`), writes v2 via host-service: `project.findByPath` → `project.setup` (link) or `project.create {kind:'importLocal'}`, then `workspaceCreation.adopt` per workspace, then presets.
- **v2 is fully local (#5731/#5786).** `project.create` makes zero cloud calls (`persistFromResolved`, `packages/host-service/src/trpc/router/project/handlers.ts:40`); workspace cloud sync is retired. Migration is offline-capable end to end. Only remaining cloud call: `findByPath {walkAllRemotes:true}` discovery of pre-local-first cloud projects — keep for linking legacy rows, never block on it.
- **Idempotency = `adopt.alreadyExists` + ledger.** `adopt` reuses rows by id / branch+path / path. The wizard's `workspace.cloudList` dedup is a stale no-op post-local-first — do NOT carry it into the migrator (and its "Imported" badge misreports; fix during extraction).
- **`v1_migration_state` ledger exists but is dormant.** `packages/local-db/src/schema/schema.ts:246` — PK `(orgId, v1Id, kind)`, kind ∈ project|workspace|preset, status ∈ success|linked|error|skipped. Zero readers/writers; we add the first.
- **Never migrated:** live terminal processes (v1 main-process `DaemonTerminalManager` vs v2 host-service `DaemonClient` — no session handoff; ceiling = fresh shell at same cwd, equal to v1's own cold restore), abandoned projects (`tabOrder = null`), workspaces mid-delete (`deletingAt`).
- **Out of scope by decision (2026-07-19):** scrollback replay and chat GUI continuity (chat panes, chat-history relink). Terminal continuity — right terminals, right cwd, right workspace — is the bar.
- **Measurement exists:** super property `surface` (v1|v2) on every event; person props `surface_ever_v2`, `surface_first_v2_at` isolate the switched-back cohort.

## Design: per-machine migrate-then-flip

Data migrates silently while the user is still on v1; each machine flips to v2 only once its own ledger says migration is complete. The flip is instant and never lands in an empty state. One release carries both the migrator and the gated flip.

### Boot flow (every launch, while surface = v1)

Preconditions: signed in, `activeOrganizationId` set, onboarded, local host-service up.

1. Run headless `runV1Migration()` (extracted from the wizard pages, shared with the manual path): projects (`findByPath` → setup/create) → workspaces (`adopt`, keeping the no-`worktreePath` NOT_FOUND fallback) → settings → presets → pending terminals. Only projects+workspaces gate the flip; the rest are best-effort and keep retrying post-flip.
2. Ledger: skip entities already `success`/`linked`; record every outcome. Prevents resurrecting v2 entities the user deleted. Host UUIDs are stable/never re-keyed, so ledger `v2_id` mappings are safe.
3. On full success, mark the org complete. **Next launch**, `useIsV2CloudEnabled` returns true. No mid-session flip.
4. On failure (repo moved, host-service down): stay on v1, retry next boot. Invisible.
5. Emit PostHog `v1_auto_migration_completed` / `_failed` with per-kind counts + reasons.

Backstop: after app version X, flip regardless of ledger state; the manual "Import from v1" button remains the recovery path.

### Seam-closers

- **Continuity of place**: map v1 `settings.lastActiveWorkspaceId` through the ledger; first v2 launch opens there, not on a dashboard.
- **Sidebar familiarity**: seed `v2SidebarProjects` / `v2SidebarSections` from v1 `tabOrder` + `workspace_sections`. Derive v2 project identity from the host fan-out (`project.list` / `useHostProjects`) — Electric v2Projects is gone.
- **Terminals at their old cwd**: `terminal.createSession({ terminalId, cwd })` per v1 terminal pane (new `readV1TabsState` procedure over `app-state.json`); #5740's `useAutoAdoptBackgroundSessions` then builds panes automatically on first open. Default layout, no v1 split geometry.
- **One-time "what changed" note** in v2 (dismissible, not a wizard) — the UI change is the only unavoidable visible seam.

### Fidelity follow-up (post-MVP, only if feedback warrants)

- Terminal split-geometry translation: write `paneLayout` explicitly via `writeWorkspacePaneLayout` instead of relying on #5740 auto-adopt (set the "backgrounded" marker to suppress double-adoption). Caveat: v1 split geometry lives in the renderer Mosaic overlay, not base `tabsState` — verify readability first. Browser/file-viewer panes could ride along field-level if we're in there anyway.

### Deletion (gated on telemetry)

Once PostHog shows surface=v1 collapsed to noise:

- Remove cohort logic and the opt-in toggle (the `optInV2` override already stopped mattering at flip time per D5).
- Delete v1 surfaces per `plans/v1-v2-delete-patterns-audit.md`: `workspace/`+`workspaces/` routes, `WorkspaceSidebar`, v1 `ChatPane`, v1 workspace data layer; then `packages/chat` and `packages/mcp` per `plans/v1-to-v2-fast-migration.md` P6.
- **Keep** `@superset/local-db` read access, the `migration` router, the headless migrator, and the import button indefinitely — tiny cost, and late updaters jump straight from v1 to a post-deletion build.

## Edge cases

| Case | Handling |
|---|---|
| No v1 data | Ledger trivially complete → flip immediately (matches new-user default anyway). |
| Offline at boot | Create/adopt are fully local — migration proceeds; legacy-cloud discovery retries later without blocking the flip. |
| Concurrent app instances | Migrator takes a per-org single-flight lock (cf. #5791 for host services). |
| v1 branch-type workspace (no worktree) | Maps to the v2 `main` workspace (both one-per-project); verify during extraction. |
| User deleted a migrated v2 workspace | Ledger `success` row → skip; never resurrect. |
| Dirty/active worktrees | `adopt` only registers the existing path, never touches the working tree. |
| Multiple orgs | Ledger is org-keyed; migrate the active org; re-run on org switch. Flip gates on active org's ledger. |
| Repo already in v2 (manual importer ran) | `findByPath` links instead of duplicating; ledger records `linked`. |
| Opt-out cohort (`optInV2 === false`) | Data migrates regardless; override stops being honored once the ledger completes (D5) — flips with everyone. |
| One entity keeps failing | Others proceed; org stays unflipped until backstop; `_failed` telemetry identifies the cohort. |

## Decisions (Kiet, 2026-07-20 /decide walkthrough)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Settings scope | Migrate **all mappable v1 settings** (worktreeBaseDir/branch prefix → host.db `hostSettings`; editor/font/notification prefs → `v2UserPreferences`); add `settings` kind to the ledger (TS-only enum change). Field-by-field mapping audit is a work item. |
| 2 | Terminal timing | **Lazy**: migrator writes pending `{terminalId, cwd}` per workspace into `v2WorkspaceLocalState`; sessions created on first workspace open, panes via #5740 auto-adopt. No eager PTY storm. |
| 3 | Preset conflicts | **Keep v2, link**: existing v2 preset (incl. #5745 auto-created) wins on agentId/name collision; ledger records `linked`, v1 preset skipped. |
| 4 | Flip gate | **Projects + workspaces only** gate the flip; settings/presets/pending-terminals are best-effort and keep retrying after the flip. |
| 5 | Opt-out cohort | **Flip with everyone** — `optInV2 === false` stops being honored once the ledger completes; no grace release. |

Remaining open: backstop version for machines whose migration never completes.

## Work items

Core (MVP — everything needed to flip and sunset):

- [ ] Extract wizard logic into shared headless `runV1Migration()` (drop stale `cloudList` dedup; fix wizard "Imported" badge)
- [ ] `v1_migration_state` reads/writes + electron-main tRPC procedures for the ledger; add `settings` kind
- [ ] Settings mapping audit + migrator: v1 `settings` row → `hostSettings` + `v2UserPreferences` (D1)
- [ ] Boot trigger with preconditions, per-boot retry, org-complete marker, per-org single-flight lock
- [ ] Gate `useIsV2CloudEnabled` on projects+workspaces ledger completion, ignoring `optInV2 === false` (D4, D5) + backstop force-flip
- [ ] Continuity: lastActiveWorkspaceId → v2 route, sidebar order/sections seeding
- [ ] `readV1TabsState` + pending-terminals record in `v2WorkspaceLocalState`, created lazily on workspace open (D2)
- [ ] Preset migration with keep-v2-link collision policy (D3)
- [ ] PostHog events + dashboard update (`plans/20260427-posthog-v1-v2-dashboard.md` is stale re: flag mechanism — fix while there)
- [ ] Deletion pass per `v1-v2-delete-patterns-audit.md` once surface=v1 collapses

Fidelity follow-up (separate PR, only if warranted): terminal split-geometry translation (Mosaic readability spike first). Scrollback replay and chat continuity are out of scope by decision.
