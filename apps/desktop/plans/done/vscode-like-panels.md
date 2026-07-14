# VS Code-like tab panels (editor groups)

Branch: `vs-code-like-panels` — implemented; this doc describes the design as shipped.

## Goal

Make tab interaction work like VS Code editor groups:

- A **panel** (editor group) holds a tab strip + the content of its active tab.
- A workspace starts as one panel holding all tabs (looks exactly like before).
- Dragging a tab over a panel's **content area** shows a VS Code-style overlay:
  - edge zones (left/right/top/bottom) split that panel, creating a new panel
    holding the dragged tab;
  - the center zone moves the tab into that panel.
- Dropping a tab on another panel's **tab strip** moves it there (at the
  hovered index); dragging within a strip reorders.
- A panel that loses its last tab collapses; panels are resizable splits,
  nested arbitrarily.

## Where it lives

The feature is implemented twice, once per workspace UI:

1. **`packages/panes` (v2 workspace — the primary surface).** Used by
   `apps/desktop` route `/v2-workspace/$workspaceId` via the `Workspace`
   component.
2. **Legacy `WorkspaceView/ContentView` tree (v1 workspace route).** Same
   interaction model, built on react-mosaic. See
   `renderer/stores/tabs/actions/panels.ts` and
   `ContentView/TabsContent/PanelsView/`.

## Design (both surfaces share it)

### Loose state + lazy derivation

Panel state is stored loosely and repaired on read, so existing actions need
no panel bookkeeping:

- `Tab.panelId?` — which panel a tab lives in.
- `panelLayout` (v2) / `panelLayouts` (v1) — split tree whose leaves are
  panel ids. Missing = single implicit panel.
- `panelActiveTabIds` — visible tab per panel; stale entries ignored.

`deriveWorkspacePanels(...)` resolves the effective state: corrupt/missing
layout → one implicit panel; unknown `panelId` → first panel; empty panels →
pruned; the workspace's active tab is always visible in its panel (panel focus
follows the active tab). Mutating actions (`moveTabToPanel`,
`splitPanelWithTab`) materialize the derived state and write it back.

### v2 specifics (`packages/panes`)

- Core: `src/core/store/panels/` (derive + pure mutations + tests); store
  gains `moveTabToPanel`, `splitPanelWithTab`, `resizePanelSplit`; `addTab`
  accepts `panelId` (defaults to the focused panel); `movePaneToNewTab`
  accepts a target `panelId` with panel-relative index. A store subscription
  records the active tab into its panel after every action.
- React: `Workspace` renders a recursive `Panels` tree
  (`ResizablePanelGroup`); each leaf is a `PanelSection` = `TabBar` (panel's
  tabs) + active `Tab` + `PanelDropZone` (5-zone overlay, mounts during tab
  drags via `useDragLayer`).
- Replaced behavior: dropping a tab onto a *pane* no longer merges the tab's
  panes into that tab (`moveTabToSplit` stays in the store API but has no UI
  trigger). Pane drag/drop (splitting, moving panes between tabs) is
  unchanged.
- Chrome: `renderBelowTabBar` (presets bar) renders once above the panel
  grid; `renderTabBarTrailing` renders in the top-right panel's bar.
- Panel selection & targeting: pointer-down anywhere in a panel's tab bar
  selects that panel (its active tab becomes the workspace active tab), and
  `renderAddTabMenu` receives `{ panelId }` so each panel's "+" creates tabs
  in its own panel (`addTab({ panelId })`; preset-created tabs follow the
  focused panel).
- Double-clicking a tab bar's empty space equalizes all panel sizes
  (`equalizePanels`); double-clicking a divider resets that split to 50/50.
  Store-driven sizes are applied to mounted `ResizablePanelGroup`s
  imperatively (they're uncontrolled after mount).
- Each panel's bar (when >1 panel) has an expand toggle at its right edge
  (`PanelExpandToggle` → `toggleExpandPanel`): expands that panel to a
  dominant share (75% at each ancestor split, siblings evened), or restores
  even sizes when already expanded — VS Code's expand-group toggle.
- Pane headers are hidden when a tab has a single pane without a toolbar —
  the tab item itself represents the terminal/chat content. Split tabs keep
  per-pane headers; the browser keeps its URL-bar header.
- Persistence: `WorkspaceState` carries the optional panel fields;
  `sanitizePaneLayout` (CollectionsProvider read heal) preserves
  `Tab.panelId`, `panelLayout`, `panelActiveTabIds` and drops malformed
  values back to the implicit panel.

### v1 specifics (legacy route)

- Store: `renderer/stores/tabs/actions/panels.ts`; UI:
  `TabsContent/PanelsView/` (outer react-mosaic of panels, per-panel
  `GroupStrip`, custom `PanelDropOverlay`). Tab drags use a no-match mosaicId
  so react-mosaic's native drop targets stay out of tab drops; each tab's
  inner pane mosaic has a per-tab id so pane drops can't cross tabs.
- The old drag-tab-onto-active-tab merge (`mergeTabIntoTab`) is replaced by
  panel splits.

## Verified

- Unit tests: panel derivation/mutations in both stores, schema heal.
- Live (CDP, v2): single-panel parity, right-edge split, bottom-edge split,
  center-drop merge + panel collapse, persistence across reload.
