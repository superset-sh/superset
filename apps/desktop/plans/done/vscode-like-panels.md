# VS Code-like tab panels (editor groups)

Branch: `vs-code-like-panels` — implemented; this doc describes the design as shipped.

## Goal

Make tab interaction work like VS Code editor groups:

- A **panel** (editor group) holds a tab strip + the content of its active tab.
- A workspace starts as one panel holding all tabs (looks exactly like before).
- Dragging a tab over a panel's **content area** shows a preview of the exact
  resulting layout: edge zones split that panel into a new panel holding the
  dragged tab; the center zone moves the tab into that panel.
- Dropping a tab on another panel's **tab strip** moves it there (at the
  hovered index); dragging within a strip reorders.
- New panels join with an **equal share** of space; when a panel collapses
  while sizes are equal, survivors re-share evenly (custom ratios preserved).
- Each bar has an expand toggle (dominant share ↔ even sizes); double-click on
  a bar's empty space equalizes; divider double-click resets that split.
- Pane headers are hidden when a tab has a single pane without a toolbar —
  the tab itself represents the terminal/chat content. Split tabs and the
  browser (URL bar) keep headers.

## Where it lives

**`packages/panes` only** — the v2 workspace surface
(`/v2-workspace/$workspaceId` via the `Workspace` component). An equivalent
implementation for the legacy v1 `WorkspaceView` tree was built and then
dropped during review: maintaining a parallel react-mosaic version doubled
the diff and every behavior change had to land twice.

## Design

### Loose state + lazy derivation

Panel state is stored loosely and repaired on read, so existing actions need
no panel bookkeeping and old persisted layouts load without migration:

- `Tab.panelId?` — which panel a tab lives in.
- `WorkspaceState.panelLayout?: PanelLayoutNode | null` — split tree whose
  leaves carry panel ids (structurally a `LayoutNode`; see the alias docs).
- `WorkspaceState.panelActiveTabIds?` — visible tab per panel.

`deriveWorkspacePanels(state)` resolves the effective state: corrupt/missing
layout → one implicit panel; unknown `panelId` → first panel; empty panels →
pruned (re-equalized if the layout was in equal mode); the workspace's active
tab is always visible in its panel (panel focus follows the active tab).
Mutations (`moveTabToPanel`, `splitPanelWithTab`) materialize the derived
state and write it back.

Every store action funnels through a wrapped `set` that atomically re-records
the active tab into its panel — one write, one subscriber notification.

### Persistence contract

`@superset/panes` owns the persisted shape (`core/store/persistence/`):
`toWorkspaceState()` builds the write snapshot and `sanitizeWorkspaceState()`
heals reads (drops corrupt tabs, repairs `activeTabId`, falls back to the
implicit panel for malformed panel fields). Both return
`Required<WorkspaceState>`, so adding an optional state field fails
compilation until it's carried through — fields can't silently vanish across
restarts. The app (`sanitizePaneLayout`, `useV2WorkspacePaneLayout`)
delegates to these.

### React

- `Workspace` renders a recursive `Panels` tree (`ResizablePanelGroup`); each
  leaf is a `PanelSection` = per-panel `TabBar` + active `Tab` +
  `PanelDropZone`. Store-driven sizes (equalize/expand) apply to mounted
  groups imperatively (they're uncontrolled after mount).
- Drop preview: `PanelDropZone` is an invisible target that classifies the
  hovered zone into a shared store; a workspace-level `DropPreviewOverlay`
  runs the exact pure drop logic and draws the destination panel's true
  post-drop rectangle.
- Per-panel "+" passes `{ panelId }` via `renderAddTabMenu`; pointer-down on
  a bar selects its panel; `renderBelowTabBar` (presets bar) renders once
  above the grid; `renderTabBarTrailing` renders in the top-right panel's bar.
- Replaced behavior: dropping a tab onto a pane no longer merges the tab's
  panes into that tab (`moveTabToSplit` was removed). Pane drag/drop within
  and across tabs is unchanged.

## Verified

- Unit tests: derivation/mutations, expand/equalize helpers, persistence
  sanitize/serialize round-trips, app schema heal.
- Live (CDP): single-panel parity, edge splits (equal shares), center-drop
  merge + collapse (re-equalize in equal mode), panel-aware "+", expand
  toggle, drop preview accuracy, persistence across reload.
