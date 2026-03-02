# Workspace-scoped tabs state refactor

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from `AGENTS.md` (root), `apps/desktop/AGENTS.md`, and the ExecPlan template at `.agents/commands/create-plan.md`.


## Purpose / Big Picture

The desktop app currently persists all tabs and panes for every workspace in a single global tabs store. Even though some pointers (like “active tab”) are keyed by `workspaceId`, the data itself (`tabs`, `panes`) lives at the top level, which makes it possible for the UI to accidentally render a tab from workspace A while the route is on workspace B. This has already caused user-facing bugs (for example: a blank file viewer pane when switching workspaces).

After this change, the tabs/panes state is organized under a workspace key (`byWorkspace[workspaceId]`). A cross-workspace tab/pane mismatch becomes unrepresentable by default, and most UI code can stop doing defensive “does this tab belong to this workspace?” checks.

This work is intended as a follow-up refactor (separate PR) after the bug fix that introduced `resolveActiveTabIdForWorkspace`.


## Assumptions

1. A “workspace” is a Superset concept representing a git worktree; routes use `/workspace/$workspaceId`.
2. Tabs and panes are conceptually workspace-local. A tab should never render while viewing another workspace route.
3. UI state persistence is local-only (lowdb JSON) at `~/.superset/app-state.json` (see `apps/desktop/src/main/lib/app-environment.ts`), not the production database.
4. It is acceptable to migrate existing persisted tabs state in-place so users keep their open tabs and panes after upgrade.


## Open Questions

1. Should `uiState.tabs.set` accept both the legacy and new schema for one release window (to tolerate dev mismatches), or enforce the new schema only?
   Decision Log: [DL-1](#dl-1-schema-backwards-compatibility)
2. After the refactor, should we keep `resolveActiveTabIdForWorkspace` as a defensive selector (for corrupted state), or delete it and rely on the new state shape plus migration sanitization?
   Decision Log: [DL-2](#dl-2-keep-or-remove-resolveactivetabidforworkspace)


## Progress

- [x] (2026-01-14 18:52Z) Draft ExecPlan
- [ ] Inventory tabs state callsites (renderer + main)
- [ ] Implement workspace-scoped state types and normalizer
- [ ] Update persistence (Zod schema + appState initialization) to the new shape
- [ ] Refactor renderer tabs store + actions to `byWorkspace`
- [ ] Update renderer UI components and selectors to use workspace slices
- [ ] Update main-process consumers (notifications/window title lookups) for new shape
- [ ] Add regression tests for migration + invariants
- [ ] Manual QA: switching workspaces with file viewers open
- [ ] Run `bun run typecheck`, `bun run lint`, `bun test` (desktop-focused)


## Surprises & Discoveries

- The tabs store persistence adapter (`apps/desktop/src/renderer/lib/trpc-storage.ts`) always returns `version: 0` to Zustand. This means migrations must be idempotent and shape-detected; you cannot rely on persisted version numbers for “run once” behavior.
- The main process reads `appState.data.tabsState` directly in a few places (for example, notification titles and pane resolution), so the refactor is not renderer-only.


## Decision Log

### DL-1 Schema backwards compatibility

TBD. Option A is to accept only the new schema (simpler, but less tolerant of dev mismatches). Option B is to accept a union of old/new shapes in `uiState.tabs.set` and normalize to the new shape (more robust, slightly more code).


### DL-2 Keep or remove resolveActiveTabIdForWorkspace

TBD. If the migration/normalization is strict and we remove cross-workspace pointers during load, we can delete the resolver. If we want extra defense-in-depth, we can keep it but move it next to the migration helper and treat it as “corruption recovery”, not a normal selection path.


## Outcomes & Retrospective

TBD after implementation.


## Context and Orientation

Relevant files and how they fit together:

- `apps/desktop/src/renderer/stores/tabs/store.ts` is the Zustand tabs store. Today it persists a single top-level structure containing `tabs`, `panes`, and maps keyed by workspace.
- `apps/desktop/src/shared/tabs-types.ts` defines the shared data model (`Tab`, `Pane`, and the persisted tabs state shape) and is imported by both main and renderer code. Shared code must not import Node.js modules.
- `apps/desktop/src/lib/trpc/routers/ui-state/index.ts` is the main-process tRPC router that validates and stores UI state in lowdb (`appState.data.tabsState`). It uses Zod to validate `uiState.tabs.set` input.
- `apps/desktop/src/main/lib/app-state/index.ts` loads and stores the lowdb file at `APP_STATE_PATH`, which is defined in `apps/desktop/src/main/lib/app-environment.ts` as `~/.superset/app-state.json`.

This plan changes the persisted tabs state shape from “global” to “workspace-scoped”:

Current (legacy) shape:

    {
      tabs: Tab[],
      panes: Record<paneId, Pane>,
      activeTabIds: Record<workspaceId, tabId | null>,
      focusedPaneIds: Record<tabId, paneId>,
      tabHistoryStacks: Record<workspaceId, tabId[]>
    }

Target (workspace-scoped) shape:

    {
      byWorkspace: Record<workspaceId, {
        tabs: Tab[],
        panes: Record<paneId, Pane>,
        activeTabId: tabId | null,
        focusedPaneIds: Record<tabId, paneId>,
        tabHistoryStack: tabId[]
      }>
    }

The goal is that a tab/pane cannot “belong” to multiple workspaces because the workspace boundary becomes the containment boundary in state.


## Plan of Work

### Milestone 1: Inventory and define invariants

Before changing types, inventory all consumers of the current tabs state shape and document the invariants the new shape must enforce.

Do this discovery from repo root:

    rg "useTabsStore\\(" apps/desktop/src/renderer -n
    rg "\\.tabsState" apps/desktop/src/main -n
    rg "activeTabIds|tabHistoryStacks|focusedPaneIds" apps/desktop/src -n

Update this ExecPlan (in `Surprises & Discoveries`) with a short list of the highest-risk callsites (places that currently scan global `tabs`/`panes`).

Acceptance: You can name the concrete files that must be updated, and you can state the invariants below as “must hold” after migration:

1. A workspace’s `activeTabId` is either null or points to a tab in `byWorkspace[workspaceId].tabs`.
2. Every `focusedPaneIds[tabId]` points to a pane that exists in the same workspace slice and whose `pane.tabId === tabId`.
3. `tabHistoryStack` contains only tab IDs that exist in the workspace slice, most-recent-first, with no duplicates.


### Milestone 2: Add a pure normalizer for legacy persisted state

Create a pure helper that converts unknown/legacy persisted tabs state into the new workspace-scoped shape, with sanitization. This helper must not import Node.js modules so it can be reused in both main and renderer.

Implementation guidance:

1. Add `WorkspaceTabsState` and the new `BaseTabsState` shape in `apps/desktop/src/shared/tabs-types.ts`.
2. Add a new shared helper file `apps/desktop/src/shared/tabs-state-normalize.ts` that exports:

    - `createEmptyWorkspaceTabsState(): WorkspaceTabsState`
    - `normalizeTabsState({ input }: { input: unknown }): BaseTabsState`

   `normalizeTabsState` should:

   - If `input` already has a `byWorkspace` object, normalize each workspace entry by filling missing fields with safe defaults and sanitizing invalid pointers.
   - If `input` matches the legacy shape (has `tabs`/`panes`), group by `tab.workspaceId` into `byWorkspace`.
   - Drop orphan panes whose `tabId` does not exist after grouping.
   - Sanitize `activeTabId`, `focusedPaneIds`, and `tabHistoryStack` using the invariants from Milestone 1.

3. Add unit tests in `apps/desktop/src/shared/tabs-state-normalize.test.ts` (or an existing shared test location if one exists) that cover:

   - Legacy shape → new shape conversion.
   - Cross-workspace `activeTabIds` values are repaired (active becomes first valid tab or null).
   - Orphan panes and invalid focused panes are removed.
   - Idempotence: normalizing an already-normalized state produces the same output.

Acceptance:

    bun test apps/desktop/src/shared/tabs-state-normalize.test.ts


### Milestone 3: Update main-process persistence to store the new shape

Update the main process to consistently store and serve the new workspace-scoped tabs state shape.

Scope:

1. Update `apps/desktop/src/main/lib/app-state/schemas.ts` so `tabsState` uses the new `BaseTabsState` shape and `defaultAppState.tabsState` is `{ byWorkspace: {} }`.
2. Update `apps/desktop/src/main/lib/app-state/index.ts` so `ensureValidShape` normalizes `data.tabsState` via `normalizeTabsState` (imported from the shared helper). This ensures old `~/.superset/app-state.json` files are reshaped on startup.
3. Update `apps/desktop/src/lib/trpc/routers/ui-state/index.ts`:

   - Replace `tabsStateSchema` with a Zod schema for the new shape.
   - Optional (depending on DL-1): accept a union of old/new schemas and normalize to the new shape in the mutation before writing.

Acceptance:

    bun run typecheck --filter=@superset/desktop

Expected: no TypeScript errors in main-process files referencing `TabsState`.


### Milestone 4: Refactor the renderer tabs store to `byWorkspace`

Refactor `apps/desktop/src/renderer/stores/tabs/store.ts` to store all tab/pane data under `byWorkspace`.

Implementation guidance:

1. Update `apps/desktop/src/renderer/stores/tabs/types.ts` so `TabsState` matches the new shared `BaseTabsState` shape (renderer `Tab` still extends the shared base tab with Mosaic layout).
2. Update the initial Zustand state in `apps/desktop/src/renderer/stores/tabs/store.ts` from:

    tabs: [], panes: {}, activeTabIds: {}, ...

   to:

    byWorkspace: {}

3. Add small internal helpers in the store module (not exported) to keep actions readable:

    - `getWorkspaceState({ state, workspaceId }: { state: TabsState; workspaceId: string }): WorkspaceTabsState`
    - `setWorkspaceState({ state, workspaceId, nextWorkspaceState }: { ... }): TabsState`
    - `findWorkspaceIdForTabId({ state, tabId }: { ... }): string | null`
    - `findWorkspaceIdForPaneId({ state, paneId }: { ... }): string | null`

4. Update every action to operate within a single workspace slice. Examples:

   - `addTab(workspaceId)` only appends to `byWorkspace[workspaceId].tabs`.
   - `removeTab(tabId)` finds the workspace first, then removes from that slice, and fixes `activeTabId` and history for that workspace.
   - `movePaneToTab(paneId, targetTabId)` returns early unless both IDs belong to the same workspace slice.

5. On persist hydration, call `normalizeTabsState` inside the Zustand `merge` function (or `migrate`) so the store always starts from a sanitized, workspace-scoped shape, even if storage returns legacy data.

Acceptance:

    bun run typecheck --filter=@superset/desktop
    bun run lint:check-node-imports --filter=@superset/desktop


### Milestone 5: Update renderer UI components to use workspace slices and remove legacy guards

Update renderer components/selectors to read the new store shape. The goal is that UI code does not need to filter a global tabs list by `workspaceId`.

At minimum, update the known high-signal callsites:

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/index.tsx`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/GroupStrip/GroupStrip.tsx`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/index.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/page.tsx`
- `apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts`

After these updates, remove any now-unused code paths that only existed to defend against cross-workspace state (depending on DL-2), such as `resolveActiveTabIdForWorkspace`.

Acceptance (manual QA):

1. Run the desktop app:

    bun dev

2. Open workspace A, open a file viewer pane (preview or pinned).
3. Switch to workspace B.
4. Expected: workspace B shows its own tabs/panes; no “blank file viewer” pane is rendered from workspace A.
5. Switch back to workspace A; the file viewer remains correct for workspace A.


### Milestone 6: Update main-process consumers of tabs state (notifications)

Update main-process code that inspects `appState.data.tabsState` to understand the new shape.

Known callsites:

- `apps/desktop/src/main/windows/main.ts` (derives notification title from tab/pane)
- `apps/desktop/src/main/lib/notifications/server.ts` (resolves pane IDs from tab/workspace)

Implementation guidance:

1. Prefer workspace-local lookups when `workspaceId` is available (use `byWorkspace[workspaceId]`).
2. When only `tabId` or `paneId` is available, scan workspaces with small shared helpers (consider adding `findTabById` / `findPaneById` helpers next to `normalizeTabsState`).
3. Keep failure mode safe: if nothing can be resolved, return `undefined` and ignore the event rather than emitting invalid IDs.

Acceptance:

    bun run typecheck --filter=@superset/desktop


### Milestone 7: Validation and cleanup

Run automated checks and clean up any leftover legacy fields, types, or tests.

Validation commands (run from repo root):

    bun run typecheck --filter=@superset/desktop
    bun run lint
    bun test --filter=@superset/desktop

If repo-wide `bun test` has unrelated failures, explicitly note them in the PR description and ensure desktop tests are green.


## Idempotence and Recovery

This refactor must be safe to apply multiple times because the persisted-state “version” is not reliable in this codebase. `normalizeTabsState` must be idempotent and must not destroy valid user state.

Recovery if migration goes wrong during local development:

1. Quit the desktop app.
2. Move the local lowdb file out of the way (do not delete immediately):

    mv ~/.superset/app-state.json ~/.superset/app-state.json.bak

3. Restart the app to regenerate defaults.

Only do this locally; do not automate deletion of user state.

