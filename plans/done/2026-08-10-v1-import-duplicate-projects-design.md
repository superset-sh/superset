# Fix: v1→v2 project importer creates duplicates and forgets imported state

**Date:** 2026-08-10
**Scope:** `packages/host-service` (project router), `apps/desktop` (V1ImportModal wizard)
**Status:** Shipped — implemented, verified end-to-end (2026-08-10)

## Problem

The v1→v2 onboarding importer ("Bring over your projects") has three user-visible
failures, all traced to one root cause plus one missing guard:

1. Pressing **Import all** runs to completion but nothing visibly changes — every
   row still shows "Import", so users press it again.
2. Reopening the importer shows no memory of what was already imported.
3. Every import (and every extra "Import all" press) creates a **new duplicate
   project** in the sidebar. A user who pressed Import all 3–4 times ends up with
   3–4 copies of every project.

The green tick after a *single-row* import is component-local React state
(`linkedV2Id` in `ImportProjectsPage.tsx`), lost when the modal closes — it
masks the underlying detection failure rather than disproving it.

## Root cause

Importing a v1 project calls host-service `project.create {kind:"importLocal"}`,
which is **fully local by design**: it inserts a row into the host's local SQLite
`projects` table and never registers anything in the cloud (see the create-saga
comment in `packages/host-service/src/trpc/router/project/handlers.ts`: "fully
local, the cloud is never involved").

The importer decides a project's state from `project.findByPath` called with
`walkAllRemotes: true` (`packages/host-service/src/trpc/router/project/project.ts`).
That branch contains a "stale local link" probe: when the local-DB row for the
repo's git root was not confirmed by any cloud remote-URL lookup, it calls cloud
`v2Project.get(id)`. For a local-first project the cloud has no row, so the call
returns `NOT_FOUND`, the candidate is marked `staleLocalLink = true`, and it is
**filtered out of the response**.

With the `local-path` candidate gone, `decideProjectImport`
(`apps/desktop/src/renderer/lib/v1-migration/projects.ts`) returns
`{kind: "import"}` — the wizard shows "Import" again and the next import mints a
brand-new project UUID for the same repo path. There is no uniqueness on
`repoPath` and `createFromImportLocal` is not idempotent, so every pass adds a row.

The staleness probe was written for "cloud project deleted from another device;
local row is orphaned". That inference contradicts the system's own architecture:
the project-delete saga in the same file states "**Local is reality** — the local
deletes are the source of truth" and local deletion removes the local row. A
surviving local row therefore means the project exists on this device,
regardless of what the cloud knows.

Supporting facts verified in code:

- `staleLocalLink` has **no consumers** anywhere in the repo — it is only
  produced and filtered inside `findByPath` itself.
- `useFinalizeProjectSetup` (renderer) only touches the sidebar and query cache;
  nothing on the import path creates a cloud row.
- The wizard *writes* the v1-migration ledger (`recordV1MigrationOutcome`) but
  never reads it; only the separate auto-migration path (`runV1Migration.ts`)
  consults it. (No change here — fixing server-side detection makes the wizard
  correct without a second bookkeeping source.)

## Fix design

### 1. Root fix — `project.findByPath` must not drop local-first projects

In the `walkAllRemotes` branch of `findByPath`
(`packages/host-service/src/trpc/router/project/project.ts`):

- Short-circuit on a local-DB hit: when a row keyed by the repo's resolved git
  root exists, return it as the sole `local-path` candidate immediately —
  before any cloud lookups — exactly like the default (non-`walkAllRemotes`)
  branch already does. Both `walkAllRemotes` callers (the wizard and the
  headless migrator) treat a `local-path` candidate as terminal
  ("already imported") without consulting cloud candidates, so skipping the
  cloud entirely is behavior-preserving where it matters and removes wasted
  network work plus spurious `cloudErrors`.
- Remove the post-loop staleness probe (the `v2Project.get` round-trip and
  `staleLocalLink` assignment) and the `staleLocalLink` field from the
  candidate shape (dead weight on the wire; nothing reads it).
- A local-DB row is authoritative: the repo is already a v2 project on this
  device ("local is reality"). The cloud remote-URL walk still runs when no
  local row exists — that path (candidate discovery for linking) is unchanged.

Behavior change accepted: a project whose cloud row was deleted from another
device now reports "already imported" instead of offering a re-import. Under
local-is-reality this is the correct answer — the local project, its workspaces,
and its sidebar entry still exist on this device.

### 2. Guard — `createFromImportLocal` becomes idempotent on repo path

In `packages/host-service/src/trpc/router/project/handlers.ts`:

- After resolving the git root (`resolveOrInitLocalRepo`), query the local
  `projects` table for an existing row with `repoPath === resolved.repoPath`.
- If found: do **not** insert and do **not** touch the row (no rename, no
  appearance changes — the user may have customized the project in v2).
  Ensure the main workspace exists (`ensureMainWorkspaceStrict`) and return
  the existing project's `{projectId, repoPath, mainWorkspaceId}`.
- If not found: current behavior (insert + main workspace).
- `CreateResult` gains an additive `created: boolean` marker (true = new row,
  false = reused). The renderer's `importV1Project` gates
  `carryV1ProjectAppearance` on it so a reused project's v1 color/hide-image
  is NOT re-stamped over v2 customizations. Version-skew default: only skip
  when `created` is explicitly `false`, so older hosts (field absent) keep
  today's behavior.

This makes repeated imports a no-op at the source, protecting against any
caller with stale query data — not just this wizard. A DB unique index on
`repoPath` is deliberately **not** added: existing user profiles already
contain duplicate rows that would fail the migration.

Known limitation (accepted): two *concurrent* creates for the same path can
still race past the check; sequential UI flows cannot. The wizard serializes
its imports, so this closes the reported bug.

### 3. Wizard — mirror the workspaces page's Import All UX

`ImportWorkspacesPage` ("Bring over your workspaces") already has the desired
behavior, verified end-to-end in local dev: ticks persist across reopen, the
header button carries a pending count, and it disappears when nothing is left.
It works because its imported-detection is purely host-local (`workspace.list`
match — no cloud probe). Bring `ImportProjectsPage` in line with that proven
pattern:

- Lift per-project import status (`idle | running | imported | error`) out of
  the row components into a page-level map, exactly like the workspaces page's
  `adoptStates`. Rows render from that shared map, so Import All and
  single-row imports drive the same visible state (today the Import All loop
  is invisible to the rows and its errors are console-only).
- Header button reads `Import all · N` where N = rows still pending, shows
  `Importing i/n` with a spinner while running, and is hidden entirely once
  no rows are pending — the same completion semantics as `Adopt all · N`.
- Error semantics (mirrors workspaces page): a failed row shows its inline
  error with a Retry action, still counts as pending for N, and is
  re-included in the next Import All run. Already-imported and running rows
  are skipped by the queue, so re-pressing mid-run or after completion is a
  no-op.
- Per-row "Linked"/imported ticks appear and persist across close/reopen
  naturally, because the post-import invalidation refetches `findByPath`,
  which (after fix 1) returns the truth — same server-truth mechanism the
  workspaces page relies on.

### 4. Existing duplicates — manual cleanup, out of scope for the PR

Profiles that already contain duplicate rows keep them; users delete the extras
through the normal project-remove flow (local rows are the source of truth). No
automatic dedupe sweep ships with this fix.

## Testing

Host-service unit tests (co-located with the router/handlers, following the
package's existing test setup):

1. `findByPath` (`walkAllRemotes: true`): a repo whose git root matches a
   local-DB row returns that row as a `local-path` candidate even when the
   cloud does not know the project id (previously dropped as stale).
2. `createFromImportLocal` called twice for the same folder returns the same
   `projectId` (second call with `created: false`) and leaves exactly one
   `projects` row; the second call still returns a valid `mainWorkspaceId`,
   and the existing row's name/color/icon are unchanged by the reuse.

Renderer: existing `v1-migration` tests (`decideProjectImport`,
`isProjectAlreadyImported`) remain valid — no contract change on the renderer
side beyond the removed (unused) `staleLocalLink` field. Import-all tallying
logic is covered by a small unit test if extracted as a pure helper.

End-to-end verification in the local dev app (evidence gate per repo CDP rules):

- Before the fix (**done, 2026-08-10, local dev stack**): reproduced by driving
  the real wizard. Four "Import all" passes produced exactly 4 duplicate host-DB
  rows per project (0→1→2→3→4, watched live); every pass logged a cloud
  `NOT_FOUND` from the staleness probe; a live `findByPath
  {walkAllRemotes:true}` call returned `{candidates: [], cloudErrors: []}`
  while 4 local rows existed for that repo path. The workspaces page
  ("Bring over your workspaces") was verified working in the same session —
  ticks persist across reopen — confirming the host-local detection pattern.
- After the fix (**done, 2026-08-10, same local dev stack, user-driven**):
  - Detection: with existing imported rows, every project rendered green
    "Linked" and the Import all button was absent; close/reopen and refresh
    preserved the state; the DB row monitor recorded zero new rows.
  - Fresh-user path (dev host DB wiped to empty, stronger variant of the
    planned single-project delete): all 5 projects showed "Import" with
    `Import all · 5`; one press ran `Importing i/5`, flipped each row to
    Linked, then hid the button; the sidebar showed exactly one copy per
    project; final DB state was exactly 1 row per repo path.

## Out of scope

- Auto-dedupe/migration for profiles that already have duplicate rows.
- Unique index on `projects.repoPath`.
- ImportWorkspacesPage / ImportPresetsPage (separate flows; not reported broken).
- Making the wizard read the v1-migration ledger.
