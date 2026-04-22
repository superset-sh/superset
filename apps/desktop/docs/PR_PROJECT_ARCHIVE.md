# Pull request: Project archive (V1 local SQLite)

Use this as the GitHub PR description (it mirrors [`.github/pull_request_template.md`](../../.github/pull_request_template.md)).

---

## Description

Adds a **project-level archive** flow for the desktop app’s **V1** path (local SQLite + `electronTrpc`), scoped to the local sidebar (`WorkspaceSidebar` / `getAllGrouped`). Archived projects are hidden from the main navbar (same mechanism as other hidden projects: `tabOrder: null`), but remain in the database with a dedicated **`archivedAt`** timestamp so they can be listed and restored.

**Data model**

- `packages/local-db`: nullable `projects.archivedAt` (epoch ms) + index; Drizzle migration `0041_vengeful_toxin.sql`.

**Backend (tRPC)**

- `projects.archive`: kill terminals for all workspaces in the project (same pattern as `projects.close`), set `archivedAt` and `tabOrder: null`, fix `lastActiveWorkspaceId` when needed, telemetry `project_archived`. Returns `workspaceIds` for the renderer.
- `projects.unarchive`: clear `archivedAt`, call `activateProject` to restore `tabOrder`, telemetry `project_unarchived`. Guardrails for already-archived / not-archived.
- `projects.getArchived`: archived projects with workspaces + `worktreePath`, ordered by `archivedAt` desc.

**Renderer**

- `useArchiveProject` / `useUnarchiveProject`: invalidate `workspaces.getAllGrouped`, `projects.getRecents`, `projects.getArchived`.
- **Project header** context menu: **Archive project** (confirm dialog) + navigation away when the active workspace belongs to the archived project (mirrors close).
- **Workspaces list** (`WorkspacesListView`): **Archived** filter segment; **Restore** per project; search works in that mode.
- **Tabs store**: `removeTabsForWorkspaceIds` reuses `removeTab` so archived projects do not leave stale tab state.

**Test / module-init fixes** (so `bun test` and related loads stay green)

- `renderer/env.renderer.ts`: honor `SKIP_ENV_VALIDATION` when `NODE_ENV` is **`test`** as well as `development`, matching `apps/desktop/bunfig.toml` and `test-setup.ts`.
- `renderer/lib/api-trpc-client.ts`: build API base URL from `process.env.NEXT_PUBLIC_API_URL` with the same default as Vite / schema, and **do not** import `renderer/env.renderer` at module top level (avoids circular init / TDZ in tests).

**Out of scope (explicit)**

- **V2 cloud** (`DashboardSidebar`, Electric collections, host DB): no parity in this PR; archive entry points exist on **V1** `ProjectHeader` only.

## Related Issues

<!-- e.g. closes #123 — replace or remove if none -->

## Type of Change

- [ ] Bug fix
- [x] New feature
- [ ] Documentation
- [ ] Refactor
- [x] Other (please describe): **Test harness / module-init fixes** (`env.renderer` skip in `test`, `api-trpc-client` URL without importing `env`)

## Testing

**Automated**

- `cd apps/desktop && bun test src/lib/trpc/routers/projects/project-archive.test.ts` (router coverage for `archive` / `unarchive` / `getArchived`).
- `cd apps/desktop && bun test` for the full desktop suite.
- From repo root: `bun run lint`, `bun run typecheck`, and desktop build as in CI (`bun turbo run build --filter=@superset/desktop`) when you want full parity.

**Manual (V1 sidebar — V2 cloud flag off)**

1. Right-click the **project row** (icon + name + workspace count), not a single workspace line → **Archive project** → confirm.
2. Project disappears from the left nav; terminals for that project stop; if you were on a workspace in that project, navigation moves to another workspace or `/workspace`.
3. Open workspaces list → **Archived** → see the project → **Restore** → project returns to the sidebar with sensible ordering.
4. `projects.getRecents` still uses `tabOrder`; archived projects stay out of recents.

## Screenshots (if applicable)

<!-- Add before/after: project context menu with Archive; Archived list with Restore -->

## Additional Notes

- **Migration**: existing installs pick up `archived_at` via the new local-db migration on next app run (your normal migration path).
- **PR process**: fork PR, allow maintainer edits — see [CONTRIBUTING.md](../../CONTRIBUTING.md).
