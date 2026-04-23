# Plan: Automated tests for project archive / unarchive / getArchived

## Goal

Add **focused automated tests** so `projects.archive`, `projects.unarchive`, and `projects.getArchived` do not regress without pulling in Electron, a real SQLite file, or the full renderer.

## Constraints (repo reality)

- `apps/desktop/test-setup.ts` globally mocks `main/lib/local-db` and `@superset/local-db` with shallow stubs that are **not** stateful enough for multi-step archive flows.
- Other desktop tests (e.g. `ai-name.test.ts`) **re-`mock.module("main/lib/local-db", …)`** inside the test file with a **small in-memory state** and fluent `select` / `update` shapes that mirror what the procedure calls.

**Approach:** follow that pattern in a **dedicated test file** that installs mocks **before** importing the module under test (or uses dynamic `import()` after mocks, if load order bites).

## Suggested file layout

| Deliverable | Path (proposal) |
|-------------|-----------------|
| Router behavior tests | `apps/desktop/src/lib/trpc/routers/projects/project-archive.test.ts` |

Keep the file **next to** `projects.ts` so reviewers find it quickly. If the file grows, split helpers into `project-archive.test-helpers.ts` (same folder).

## Mocks to install (per test file)

1. **`main/lib/local-db`** — Replace global stub with a **fake DB object** that:
   - Stores rows for `projects`, `workspaces`, `settings` in plain JS structures (`Map` or arrays).
   - Implements the **minimal** chain your procedures use, e.g.:
     - `localDb.select().from(projects).where(eq(...)).get()`
     - `localDb.select().from(workspaces).where(...).all()`
     - `localDb.update(projects).set(...).where(...).run()`
     - `localDb.select().from(settings).get()` (for `lastActiveWorkspaceId`)
   - You do **not** need full Drizzle parity—only the shapes `projects.ts` actually calls for these three procedures.

2. **`main/lib/workspace-runtime`** — `getWorkspaceRuntimeRegistry().getForWorkspaceId(id).terminal.killByWorkspaceId(id)`:
   - Return `{ failed: 0 }` (and optionally assert it was called once per workspace).

3. **`main/lib/analytics`** — `track` as `mock()`; assert `project_archived` / `project_unarchived` with expected payload keys (`project_id`).

4. **`electron` `dialog`** — Not needed for these procedures (no `getWindow` path in archive/unarchive/getArchived).

5. **Import order** — In Bun, declare `mock.module(...)` **before** importing `createProjectsRouter` or calling into `projects.archive` if you see stale mocks; otherwise use **dynamic `import()`** after all `mock.module` registrations.

## Test cases (minimum set)

### `getArchived`

- **Empty:** no projects with `archivedAt` → `[]`.
- **One project:** one archived project + two workspaces (one with `deletingAt` set) → result excludes deleting workspace; includes `worktreePath` string (branch workspace can use main repo path from fake project row).

### `archive`

- **Happy path:** project with `tabOrder: 1`, `archivedAt: null`, two workspaces → after mutation:
  - `archivedAt` is a number (or `expect` close to `Date.now()` in a window),
  - `tabOrder` is `null`,
  - workspaces rows **unchanged** (still present),
  - `killByWorkspaceId` called twice (or N times),
  - `track("project_archived", …)` fired.
- **Guard:** project already has `archivedAt` → `TRPCError` `BAD_REQUEST` (or whatever `projects.ts` throws).
- **Not found:** unknown `id` → `NOT_FOUND` / `Error` per existing router style.
- **Active workspace:** `settings.lastActiveWorkspaceId` equals one of the project’s workspace ids → after archive, setting updated to `null` or to the **next** id your fake `selectNextActiveWorkspace` would return—simplest is to mock `../workspaces/utils/db-helpers` **only** `selectNextActiveWorkspace` to return a fixed `"other-ws"` and assert `setLastActiveWorkspace` behavior via the fake `settings` row (if you mock those helpers, keep the mock narrow).

**Note:** If mocking `selectNextActiveWorkspace` / `setLastActiveWorkspace` is heavy, split into a second test file that imports **only** the archive block by extracting logic (see “Refactor optional” below)—only do that if the mock graph becomes unmaintainable.

### `unarchive`

- **Happy path:** archived project (`archivedAt` set, `tabOrder: null`) → after mutation `archivedAt` is `null` and `tabOrder` restored per `activateProject` rules. Easiest assertion: mock `activateProject` as `mock()` and expect it called once with the refreshed project object **or** assert `tabOrder` is `max+1` if you implement full fake `getMaxProjectTabOrder` behavior in the fake DB.
- **Guard:** `archivedAt` already null → `BAD_REQUEST`.
- **Not found:** missing project → `NOT_FOUND`.

### Terminal warning (optional)

- If `killByWorkspaceId` returns `{ failed: 1 }`, archive response includes `terminalWarning` substring — one test.

## Refactor (optional, only if mocks explode)

If maintaining a fluent fake `localDb` for `projects.ts` is painful:

1. Extract **pure** functions, e.g. `computeArchiveProjectUpdate(project, workspaces, now)` and `pickWorkspaceIdsForKill(workspaces)`, and unit-test those with plain objects.
2. Keep the router as a thin orchestration layer.

Only pursue this if the first test file becomes hundreds of lines of mock plumbing.

## Renderer / hooks (phase 2, optional)

Lower priority than router tests:

- `useArchiveProject` / `useUnarchiveProject`: would require React Query + `electronTrpc` test doubles; usually skipped unless the repo already has a harness for hook tests.

## CI / commands

After implementation:

```bash
cd apps/desktop && bun test src/lib/trpc/routers/projects/project-archive.test.ts
```

Then full `bun test` under `apps/desktop` before PR update.

## Definition of done

- [ ] New test file runs in isolation and in full `apps/desktop` suite (`0 fail`).
- [ ] Covers **happy path + guards** for archive and unarchive, and **shape** of `getArchived`.
- [ ] No reliance on real network, real SQLite, or global `.env` beyond existing `test-setup` / `bunfig`.
- [ ] PR description updated with one line: “Adds router tests for project archive.”

## Out of scope

- V2 / `DashboardSidebar` / Electric.
- E2E (Playwright) unless the team already runs them for desktop flows.
