# V2 configurable branch prefixes (SUPER-835)

Brings back v1's "branch prefix" feature for the v2 (host-service) workspace
flow. Requested by Censys for their org-wide v2 trial.

## Behaviour (v1 parity)

- Modes: `none`, `github` (GitHub username), `author` (git `user.name`),
  `custom` (free string).
- Two levels: a host-wide global default plus an optional per-project
  override. Project override wins when its mode is set; otherwise the global
  default applies; otherwise `none`.
- The resolved prefix is prepended as a path segment: `prefix/branch-name`.
- Applied to **new** branches only — auto-generated names (AI / friendly
  random) and user-typed branch names that don't already exist. Existing
  branches and PR checkouts are never re-prefixed.
- Collision guard: if the prefix equals an existing branch name, it's dropped
  (git can't have both `censys` and `censys/foo`).

## Where it lives

v1 stored this in the desktop's local SQLite. v2 runs workspace creation in
`packages/host-service`, which has its own SQLite DB — so storage is
host-local there too (per the product decision for this ticket).

## Changes

1. **`@superset/shared/workspace-launch/branch.ts`** — export
   `BRANCH_PREFIX_MODES` + `BranchPrefixMode` (host-service can't depend on
   `@superset/local-db`). `resolveBranchPrefix` already lived here.
2. **host-service DB** (`packages/host-service/src/db/schema.ts`) —
   `projects.branchPrefixMode` / `branchPrefixCustom` columns + a single-row
   `host_settings` table for the global default. New drizzle migration
   (auto-applied on startup).
3. **host-service `branch-prefix.ts` util** — git author / GitHub username
   lookups + `resolveProjectBranchPrefix` (cascade + collision guard).
4. **host-service `settings` router** — `getBranchPrefix`, `setBranchPrefix`,
   `getGitInfo` (for the UI preview).
5. **host-service `project` router** — `get` returns the prefix columns;
   new `setBranchPrefix` mutation.
6. **host-service `workspaces.create`** — applies the resolved prefix when
   deriving a new branch name.
7. **Renderer** — `V2GitSettings` (global default, on the existing
   `/settings/git` route) and a `BranchPrefixSection` in `V2ProjectSettings`
   (per-project override with a "use global default" option).
