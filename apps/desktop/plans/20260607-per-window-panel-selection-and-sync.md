# Per-window panel selection + cross-window tabs sync

**Goal:** Two (or more) windows can show the *same workspace* while each sits on a *different tab/pane*. Tab structure stays consistent across windows in real time.

## Problem

- `BaseTabsState` keys selection by workspace, not window: `activeTabIds: Record<workspaceId, tabId>`, `focusedPaneIds: Record<tabId, paneId>` (`src/shared/tabs-types.ts:252-258`). Every window of a workspace mirrors the same active tab.
- Tabs state persists as one global blob via zustand persist → tRPC → lowdb `appState.data.tabsState` (`src/lib/trpc/routers/ui-state/index.ts:240-249`, `src/renderer/lib/trpc-storage.ts:226-233`). There is **no broadcast**: windows hydrate at boot only, and whole-state writes from two windows clobber each other (last-writer-wins).

## Design

### A. Per-window selection (already true in memory — keep it that way)

**Finding during implementation:** each BrowserWindow runs its own renderer with its own zustand instance, and the tabs store hydrates from the persisted blob exactly once at boot (no runtime `rehydrate()` anywhere). Selection (`activeTabIds`, `focusedPaneIds`) therefore *already diverges per window after boot*. The mirroring users see comes from (a) both windows seeding the same persisted selection at boot — acceptable, it's a seed — and (b) the absence of structural sync, which makes two windows clobber each other's whole state (§B).

So **no store split is needed**. The store, its ~50 actions, and all component call sites stay untouched. The per-window behavior falls out of §B's rule: *remote sync applies structure only; selection fields always stay local*. A `focusTabId` boot query param (§C/§D) overrides the seeded selection when a window is opened targeting a specific tab.

### B. Cross-window live sync of tab structure

- `uiState.tabs.set` keeps writing lowdb, then emits on a main-process `EventEmitter` with the **sender `webContents.id`** (available from trpc-electron ctx event).
- New subscription `uiState.tabs.onChange` (observable pattern — trpc-electron requires observables, see apps/desktop/AGENTS.md) pushing `{ state, sourceWebContentsId }`.
- Renderer subscribes at tabs-store init; ignores self-originated events (own webContents id via new `windows.self` query). Remote events apply *structure* (`tabs`, `panes`) into the tabs store behind an `applyingRemoteUpdate` module flag that the tRPC storage adapter consults to suppress the echo write.
- After a remote apply, the window-selection store reconciles: active tab missing → fall back to workspace's first tab; focused pane missing → first pane in the tab's layout.

### C. Window identity

- `windows.self` tRPC query: resolves the calling window via `getManagedWindowByWebContents(ctx sender id)` → `{ windowId, webContentsId, workspaceId }`.
- `MainWindow` accepts `focusTabId?: string`, forwarded as a query param (alongside existing `workspaceId`) so a new window can boot focused on a specific tab.

### D. UX affordances

- tRPC mutation `windows.openWorkspaceWindow({ workspaceId, focusTabId? })` → `MainWindow({ workspaceId, stagger: true, focusTabId })`.
- `WorkspaceContextMenu.tsx`: add **"Open in New Window"**.
- Tab strip context menu: add **"Open Tab in New Window"** (passes `focusTabId`; tab remains in all windows since structure is shared — the new window simply focuses it).
- `routes/page.tsx` (and the workspace route): accept `focusTabId` search param → seed the window-selection store before first paint.

### Accepted limitation: unversioned concurrent-write race

Persistence stays full-snapshot last-writer-wins without versioning. The echo-suppression path cancels any pre-merge local write still in the debounce window (so a remote broadcast cannot be reverted by a stale queued flush), but two windows making **structural** mutations within the same ~300ms debounce window can still lose one of the writes — the later `tabs.set` snapshot wins. This is accepted for now: structural mutations are human-paced (tab create/close/rename), so sub-300ms concurrent structural edits from two windows are rare, and the loser's window converges to the broadcast state rather than diverging. If this ever bites, the fix is a monotonic version in main (`tabs.set` carries `basedOnVersion`; stale writes rejected and re-merged by the renderer).

## Non-goals

- Persisting *per-window* selection across relaunches (two windows of the same workspace share one `stateKey` for bounds today; same trade-off accepted).
- Per-window tab structure (tabs stay workspace-scoped; windows are views over the same structure).

## Verification

- Unit: window-selection store seed/reconcile; echo suppression in storage adapter; `onChange` emits with source id.
- Manual: two windows on one workspace — switch tabs independently; create/close a tab in A appears in B; relaunch restores last selection.
- `bun test`, `bun run lint`, `bun run typecheck` clean.
