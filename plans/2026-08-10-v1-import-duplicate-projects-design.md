# Fix: v1→v2 project importer creates duplicates and forgets imported state

**Date:** 2026-08-10
**Scope:** `packages/host-service` (project router), `apps/desktop` (V1ImportModal wizard)
**Status:** Draft — pending review

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

- Remove the post-loop staleness probe (the `v2Project.get` round-trip and
  `staleLocalLink` assignment).
- Remove the `staleLocalLink` filter and the field itself from the candidate
  shape (it is dead weight on the wire; nothing reads it).
- A local-DB row keyed by the repo's resolved git root is authoritative: the
  repo is already a v2 project on this device. This matches the default
  (non-`walkAllRemotes`) branch, which already short-circuits on a local hit
  without consulting the cloud.

Behavior change accepted: a project whose cloud row was deleted from another
device now reports "already imported" instead of offering a re-import. Under
local-is-reality this is the correct answer — the local project, its workspaces,
and its sidebar entry still exist on this device.

### 2. Guard — `createFromImportLocal` becomes idempotent on repo path

In `packages/host-service/src/trpc/router/project/handlers.ts`:

- After resolving the git root (`resolveOrInitLocalRepo`), query the local
  `projects` table for an existing row with `repoPath === resolved.repoPath`.
- If found: do **not** insert. Ensure the main workspace exists
  (`ensureMainWorkspaceStrict`) and return the existing project's
  `{projectId, repoPath, mainWorkspaceId}`. Do not overwrite the existing
  project's name/appearance — the user may have customized it in v2.
- If not found: current behavior (insert + main workspace).

This makes repeated imports a no-op at the source, protecting against any
caller with stale query data — not just this wizard. A DB unique index on
`repoPath` is deliberately **not** added: existing user profiles already
contain duplicate rows that would fail the migration.

Known limitation (accepted): two *concurrent* creates for the same path can
still race past the check; sequential UI flows cannot. The wizard serializes
its imports, so this closes the reported bug.

### 3. Wizard — Import All completion feedback

In `apps/desktop/src/renderer/routes/_authenticated/components/V1ImportModal/ImportProjectsPage/ImportProjectsPage.tsx`:

- `importAll` tallies outcomes per project: `imported`, `alreadyImported`
  (decision ≠ "import"), `failed` (caught error).
- On completion, the header button shows a transient summary state (e.g.
  "✓ Imported 4" — count of newly imported; if everything was already imported,
  "All imported") for 4 seconds before reverting to "Import all". While in
  the summary state the button stays disabled.
- No other wizard changes: per-row "Linked" ticks now appear naturally because
  the post-import invalidation refetches `findByPath`, which (after fix 1)
  returns the truth. Reopening the importer likewise shows imported rows as
  Linked/Imported.

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
   `projectId` and leaves exactly one `projects` row; the second call still
   returns a valid `mainWorkspaceId`.

Renderer: existing `v1-migration` tests (`decideProjectImport`,
`isProjectAlreadyImported`) remain valid — no contract change on the renderer
side beyond the removed (unused) `staleLocalLink` field. Import-all tallying
logic is covered by a small unit test if extracted as a pure helper.

End-to-end verification in the local dev app (evidence gate per repo CDP rules):

- Before the fix: reproduce — import a project, reopen the importer, observe
  "Import" still offered; press Import all twice, observe duplicate sidebar rows.
- After the fix: same journey — rows flip to Linked/imported, Import all a
  second time is a no-op ("All imported"), reopening the importer shows imported
  state, sidebar gains exactly one row per project.

## Out of scope

- Auto-dedupe/migration for profiles that already have duplicate rows.
- Unique index on `projects.repoPath`.
- ImportWorkspacesPage / ImportPresetsPage (separate flows; not reported broken).
- Making the wizard read the v1-migration ledger.
