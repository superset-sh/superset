# Setup/Teardown Scripts for v2 Projects

Status: plan. v2-only — v1 code paths must not change.

## Goal

Build the v2 equivalent of the v1 project-settings UI for editing
`.superset/config.json` setup and teardown scripts, and make v2 workspace
creation honor the configured `setup` array (today it only checks for a
literal `<worktreePath>/.superset/setup.sh`).

## Scope rule

Touch only v2 surfaces. Do not modify the v1 ScriptsEditor, the v1
electronTrpc `config` router, the v1 `setup-script-card`, or any v1 callsite.
v1 stays exactly as it is on `main`. Per project memory: v1 desktop UI is
sunset, prefer v2-first fixes.

## Outcome target

| Surface | Before | After |
|---|---|---|
| v2 project settings → Scripts editor | missing | mounted, talks to host-service |
| v2 sidebar → Setup-scripts CTA | missing | new card, dismissable per-project |
| v2 workspace creation → setup terminal | reads `<worktree>/.superset/setup.sh` only | resolves config.json + override + overlay, falls back to `<repo>/.superset/setup.sh` |
| `<worktree>/.superset/` copy from main | required (`copySupersetConfigToWorktree`) | not needed; main repo is single source of truth |

## Architecture

```
renderer (v2 only)
  V2ScriptsEditor ──▶ host-service.config.{getConfigContent, updateConfig}
                            │
                            ▼
                  loadSetupConfig({ repoPath, projectId })
                            │
                  ┌─────────┴─────────┐
                  ▼                   ▼
          .superset/config.json   ~/.superset/projects/<id>/config.json
                  │
                  └──── + .superset/config.local.json (overlay)
```

The host-service is the authoritative path for v2 — it owns the v2 project's
`repoPath` and does its own filesystem I/O, which means it works correctly for
any host-service location (local or remote-via-relay), not just when
host-service runs on the same machine as Electron.

Both the v2 editor and the v2 workspace creation runner go through the same
host-service config loader, so what the user types in the editor is what
actually runs on workspace creation — no second source of truth.

## Implementation plan

### 1. Host-service config loader

`packages/host-service/src/runtime/setup/config.ts` — `loadSetupConfig` +
`hasConfiguredScripts`.

Resolution order (later wins for keys it explicitly defines):

1. `<repoPath>/.superset/config.json` — canonical, written by the editor.
2. `~/.superset/projects/<projectId>/config.json` — per-machine user override.

Then `<repoPath>/.superset/config.local.json` applies as an overlay with
before/after/replace semantics per key.

Validates element types up-front (rejects `[123, "ok"]`). Returns `null` if no
source exists. Generic `readJson<T>()` handles read+parse+log; shape validators
sit on top.

Does **not** read `<worktreePath>/.superset/config.json` (v1 did) — the
worktree no longer holds a separate copy, so the main repo is the single
source of truth across all worktrees.

### 2. Host-service config router

`packages/host-service/src/trpc/router/config/config.ts` — new tRPC router
exposing three procedures, all keyed on a v2 `projectId`:

- `getConfigContent({ projectId })` → `{ content: string | null, exists }` — reads
  `<repoPath>/.superset/config.json` raw.
- `updateConfig({ projectId, setup, teardown })` → writes the file, preserving
  any existing top-level keys (including `run`) via spread.
- `shouldShowSetupCard({ projectId })` → `boolean` — uses `loadSetupConfig` so
  the card hides correctly when configuration comes from the user override or
  local overlay, not just `config.json`.

Register under `config:` in `packages/host-service/src/trpc/router/router.ts`.

### 3. Host-service setup terminal

`packages/host-service/src/trpc/router/workspace-creation/shared/setup-terminal.ts`.

Rewrite `startSetupTerminalIfPresent` to resolve an `initialCommand`:

1. If the resolved `setup` array is non-empty, run the commands joined with
   `&&` so a failure short-circuits.
2. Else fall back to `bash <repoPath>/.superset/setup.sh` (resolved against the
   main repo, **not** the worktree).
3. Else no-op.

Terminal `cwd` stays the worktree; `$SUPERSET_ROOT_PATH` (already injected by
the v2 terminal env builder) exposes the main repo path so scripts can reach
the canonical `.superset/` dir without it being copied into worktrees.

Drop the unused `worktreePath` arg on the public function and replace the two
sequential `select` calls with a single `workspaces ⨝ projects` join.

Simplify the caller in `packages/host-service/src/trpc/router/workspaces/workspaces.ts`:
drop the redundant pre-lookup of `setupWorktreePath` (the helper does its own
lookup and no-ops gracefully).

### 4. v2 ScriptsEditor

New component family at
`apps/desktop/src/renderer/routes/_authenticated/settings/v2-project/$projectId/components/V2ProjectSettings/components/V2ScriptsEditor/`:

- `V2ScriptsEditor({ hostUrl, projectId })` — uses raw `useQuery` /
  `useMutation` against `getHostServiceClientByUrl(hostUrl).config.*` (matching
  how `V2ProjectSettings` already talks to the host-service for `project.get`).

Behavior:

- Save **on blur only** (no debounce while typing).
- Trim **on blur** (so newlines typed mid-edit aren't dropped).
- Multi-line textareas → multi-element arrays
  (`split('\n').map(trim).filter(Boolean)`) — the runner does `.join(' && ')`,
  so collapsing into one newline-separated string would silently change failure
  semantics.
- No-op skip when the trimmed value matches the last saved snapshot.
- Server-sync guard: while a textarea is focused, server data won't clobber
  in-progress edits.
- Two tabs: Setup, Teardown. No Run tab in v1.x — v2 has no equivalent of v1's
  `getResolvedRunCommands` hotkey-triggered runner. The editor doesn't send
  `run` in payloads; the host server preserves any existing on-disk value via
  its conditional spread.

Visual:

- Section heading + description matching the v2 `SettingsSection` style used
  by `NameSection`, `RepositorySection`, etc. (smaller `text-sm font-medium`
  heading, not the large `text-base font-semibold` used by v1).
- Inline save status next to the heading ("Saving…" amber dot, "Saved" emerald
  check, fades after 2 s).
- Shared `@superset/ui/textarea` component for the editor.
- Drag-drop overlay for `.sh` files (subtle ring rather than heavy border).
- "Import file" button in the corner (`h-7`, ghost variant).
- "Docs" link (`h-7`, ghost variant) opening
  `EXTERNAL_LINKS.SETUP_TEARDOWN_SCRIPTS`.

Mount in `V2ProjectSettings.tsx` after the Appearance section, gated on
`activeHostUrl`.

### 5. v2 SetupScriptCard

New component at
`apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/V2SetupScriptCard/`.

`V2SetupScriptCard({ hostUrl, projectId, projectName, isCollapsed })` —
`SidebarCard` wrapper that hides itself unless:

- The user is viewing a v2 workspace (so a project context exists).
- `host-service.config.shouldShowSetupCard({ projectId })` returns true.
- The card hasn't been dismissed for that v2 project.

Action: navigate to `/settings/projects/$projectId` (this route already
detects v2 vs v1 and renders `V2ProjectSettings`).

Dismissal stored client-side in
`apps/desktop/src/renderer/stores/v2-setup-card-dismissals/` — small
zustand+persist store keyed by v2 projectId. Per-machine UI state, no server
roundtrip.

Mount in `DashboardSidebar.tsx` between `DashboardSidebarPortsList` and the
settings/help footer. Active project computed from
`useMatchRoute({ to: '/v2-workspace/$workspaceId' })` plus a lookup through
`groups` (the existing dashboard sidebar data).

## Things deliberately NOT done

- **No `copySupersetConfigToWorktree` equivalent.** Worktrees stay clean; main
  repo is the canonical source. Scripts that need to reach repo-tracked
  `.superset/` files use `$SUPERSET_ROOT_PATH`. Edits in the settings UI take
  effect on the next workspace creation immediately, instead of being frozen
  at each worktree's creation time.

- **No worktree-level `config.json` read** (v1 had it). Reading from the
  worktree would re-introduce the drift bug v1 had. User-level + local overlay
  still cover per-machine customization.

- **No Run tab.** v2 has no equivalent of v1's `getResolvedRunCommands`
  hotkey-triggered runner. When that lands, add a Run tab and wire it up.

- **No changes to v1.** The v1 ScriptsEditor, v1 electronTrpc `config` router,
  v1 SetupScriptCard, and all v1 callsites stay exactly as they are on main.

## Test plan

- [ ] Open a v2 project's settings → "Scripts" section appears between
  Appearance and Delete; edits to Setup/Teardown persist to
  `<repoPath>/.superset/config.json`.
- [ ] Open a v1 project's settings → editor still works exactly as before;
  v1 codepath untouched.
- [ ] Type into a textarea, press Enter to add a newline at the end → blur the
  textarea → newline is trimmed and a save fires once.
- [ ] Type a change and immediately switch tabs → the change saves on blur
  (not while typing).
- [ ] Type and revert to original → blur fires no network request.
- [ ] Drag a `.sh` file onto a textarea → contents replace the value; blur
  saves it.
- [ ] Open a v2 project whose config already has a non-empty `run` array →
  run value is preserved on subsequent saves of setup/teardown.
- [ ] Configure setup commands via the editor → create a new v2 workspace →
  setup terminal opens and runs the commands joined with `&&`.
- [ ] Project has no `config.json` but has `<repoPath>/.superset/setup.sh` →
  new v2 workspace runs `bash <repoPath>/.superset/setup.sh` with the worktree
  as cwd.
- [ ] Project has no scripts of any kind → no setup terminal opens.
- [ ] Edit setup commands while a v2 workspace is mid-creation → only future
  workspaces pick up the change (in-flight one keeps its snapshot).
- [ ] On a v2 project with no scripts, the `V2SetupScriptCard` shows in the
  sidebar; clicking "Configure" lands on the v2 project settings page.
- [ ] Dismiss the card → it stays dismissed across reloads for that project,
  shows again on a different project.
- [ ] Add a `.superset/config.local.json` with `setup.before` → the prepended
  commands run first; the canonical setup runs after; the card is hidden
  because configured scripts now exist via the overlay.
