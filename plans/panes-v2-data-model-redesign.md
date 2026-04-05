# Pane Layout: New Tab + Split + Pane Model

## Context

The current v2 pane model has a 3-tier layout tree: **Root → Split/Group → Pane**. `PaneGroupNode` is a leaf in the split tree that contains a *tab strip* of multiple panes — essentially tabs-within-tabs. The goal is to flatten this to **Tab → Split → Pane**. Each leaf in the layout tree becomes a single pane, no inner tab strip.

No backwards compatibility or migration needed — this isn't live yet.

---

## Schema

### Layout Tree (purely structural — no pane data)

```ts
type SplitDirection = "horizontal" | "vertical";

type LayoutNode =
  | { type: "pane"; paneId: string }
  | {
      type: "split";
      id: string;
      direction: SplitDirection;
      children: LayoutNode[];  // n-ary (not binary)
      weights: number[];           // relative weights, one per child (e.g. [1, 2, 1])
    };
```

**N-ary splits** — matches FlexLayout and VS Code's approach.

**Relative weights** instead of percentages (FlexLayout's approach). Weights don't need to sum to any specific value — they're proportional. `[1, 1, 1]` = equal thirds, `[3, 2]` = 60/40. Sidesteps the "33.33 + 33.33 + 33.34" rounding problem entirely.

- **Rendering**: CSS `flex-grow` takes weights directly — `flexGrow: weight` on each child.
- **Resize drag**: UI snapshots pixel sizes from the DOM on mousedown, does pixel math during drag, then converts back to weights via `newPixelSize / totalPixels * sumOfWeights`. Only the two panes adjacent to the dragged splitter are affected.
- **Equalize**: just set all weights to `1`. Done.

The layout tree only holds `paneId` strings — pane data lives separately in a flat map.

### Pane Data (generic)

```ts
interface Pane<TData> {
  id: string;
  kind: string;
  titleOverride?: string;  // optional override; titles derived via registry's getTitle()
  pinned?: boolean;         // unpinned panes can be replaced in-place (e.g. file preview)
  data: TData;              // pane-specific state lives here (including status indicators, URLs, etc.)
}
```

- **`@superset/panes` stays generic** — `TData` parameterized by consumers
- **Titles are derived** by the registry's `getTitle(context)`, with optional `titleOverride` for user renames
- **`pinned`** — controls preview/replace behavior. Unpinned panes (e.g. file preview on single-click) can be replaced in-place without splitting. Double-click or edit pins the pane so it persists.

### Open-a-pane behavior (e.g. quick-open, open file from sidebar)

This is the most common user flow — currently `addPaneToGroup({ replaceUnpinned: true })`. In the new model:

```
1. Check if the file is already open in the tab → focus it (setActivePane)
2. Find ANY unpinned file pane in the tab (scan tab.panes for kind === "file" && !pinned):
   → replacePane(tabId, paneId, newPane)  — swap entire Pane, update layout tree paneId ref
   (VS Code behavior: preview pane is a tab-wide singleton, not tied to focus)
3. No unpinned file pane, but active pane exists:
   → splitPane(tabId, activePaneId, "right", newPane)  — split the active pane to the right
4. No active pane / no tab:
   → addTab with the new pane
```

Default split direction is **right** (horizontal). This matches VS Code's behavior and the v1 `splitPaneAuto` which picked vertical/horizontal based on dimensions — we can refine later, but right is the sane default.

The consumer (apps/desktop `PaneViewer.tsx`) owns this logic, not the pane-layout package. The package provides the primitives (`replacePane`, `splitPane`, `addTab`), the app composes them.

### Tab

```ts
interface Tab<TData> {
  id: string;
  titleOverride?: string;
  createdAt: number;
  activePaneId: string | null;
  layout: LayoutNode | null;          // null = empty tab
  panes: Record<string, Pane<TData>>;  // flat map, O(1) lookup
}
```

- **`panes` as flat map** — layout tree is purely structural (`paneId` refs), pane data lives here. Clean separation.
- **`activePaneId`** — single level of focus tracking (replaces the old two-hop `activeGroupId` → group's `activePaneId` chain)
- **`layout: null`** — not a normal state. Tabs always have at least one pane: creation makes one, closing the last pane closes the tab. Null is only for transient/initial states.

### Workspace (top-level)

```ts
interface WorkspaceState<TData> {
  version: 1;
  tabs: Tab<TData>[];
  activeTabId: string | null;
}
```

### Drop Targets

```ts
type SplitPosition = "top" | "right" | "bottom" | "left";

type DropTarget = {
  type: "split";
  tabId: string;
  paneId: string;
  position: SplitPosition;
};
```

Dragging always creates a split. No "add as tab within group" drop zone (groups don't exist).

---

## Concrete Example

```json
{
  "version": 1,
  "tabs": [
    {
      "id": "tab_1",
      "titleOverride": "Chat",
      "createdAt": 1743300000000,
      "activePaneId": "pane_chat",
      "layout": {
        "type": "split",
        "id": "split_1",
        "direction": "horizontal",
        "children": [
          { "type": "pane", "paneId": "pane_chat" },
          { "type": "pane", "paneId": "pane_term" }
        ],
        "weights": [3, 2]
      },
      "panes": {
        "pane_chat": {
          "id": "pane_chat",
          "kind": "chat",
          "data": { "sessionId": null }
        },
        "pane_term": {
          "id": "pane_term",
          "kind": "terminal",
          "data": {
            "cwd": "/workspace/my-repo",
            "launchMode": "workspace-shell"
          }
        }
      }
    }
  ],
  "activeTabId": "tab_1"
}
```

---

## Store Interface

### Tab actions

| Action | Signature | Notes |
|---|---|---|
| `addTab` | `(tab: Tab)` | Adds a new tab |
| `removeTab` | `(tabId: string)` | Removes tab, activates neighbor |
| `setActiveTab` | `(tabId: string)` | Switches active tab |
| `setTabTitleOverride` | `(tabId, titleOverride?)` | |
| `getTab` | `(tabId) → Tab \| null` | |
| `getActiveTab` | `() → Tab \| null` | |

### Pane actions

| Action | Signature | Notes |
|---|---|---|
| `setActivePane` | `(tabId, paneId)` | Sets focused pane in tab |
| `getPane` | `(paneId) → { tabId, pane } \| null` | Searches across all tabs |
| `getActivePane` | `(tabId?) → { tabId, pane } \| null` | |
| `closePane` | `(tabId, paneId)` | Removes from layout + panes map, collapses empty splits |
| `setPaneData` | `(paneId, data)` | Updates pane data in flat map |
| `setPaneTitleOverride` | `(tabId, paneId, titleOverride?)` | |

### Split actions

| Action | Signature | Notes |
|---|---|---|
| `splitPane` | `(tabId, paneId, position, newPane, weights?)` | Wraps target pane in a split with the new pane |
| `addPane` | `(tabId, pane, position?, relativeToPaneId?)` | Adds pane by splitting; appends to edge if no target |
| `resizeSplit` | `(tabId, splitId, weights)` | Updates weights array (UI converts pixels → weights) |
| `equalizeSplit` | `(tabId, splitId)` | Sets all weights to `1` |

### Pane pin actions

| Action | Signature | Notes |
|---|---|---|
| `setPanePinned` | `(tabId, paneId, pinned)` | Pin/unpin a pane |
| `replacePane` | `(tabId, paneId, newPane: Pane)` | Replace an unpinned pane with a full new Pane. Removes old entry from `panes` map, adds new entry, updates the layout tree leaf's `paneId` to `newPane.id`. No structural layout change (no splits created/removed). No-op if target pane is pinned. |

### Bulk

| Action | Signature |
|---|---|
| `replaceState` | `(next \| (prev) => next)` |

---

## Splitting Behavior

When splitting a pane, the new pane steals space from the target — everything else stays put.

**Split into a new direction** (target pane is a leaf or in a split with a different direction):
```
Before: { type: "pane", paneId: "A" }
Split A right with new pane B:
After:  { type: "split", direction: "horizontal", children: [A, B], weights: [1, 1] }
```

**Split within an existing same-direction split** (e.g., drop right on a pane already in a horizontal split):
```
Before: weights [3, 2, 1], split pane[1] (weight 2)
After:  weights [3, 1, 1, 1]  — pane[1]'s weight halved, new pane inserted adjacent
```

The rule: `targetWeight / 2` for each of the two panes. Other siblings are untouched.

**Position → Direction mapping:** left/right → `"horizontal"`, top/bottom → `"vertical"`. Position also determines child order: left/top → new pane first, right/bottom → new pane second.

---

## Collapsing / Normalization

When a pane is closed:
1. `context.actions.close()` calls the registered `onBeforeClose` handler (if any) — if it returns false, stop (e.g. "Save changes?" modal)
2. Remove the `{ type: "pane", paneId }` leaf from the parent split's `children` and `weights` arrays
3. Remove corresponding entry from `tab.panes`
4. If the parent split has 1 child left → replace the split with that child (collapse). Recurse up.
5. If `activePaneId` was the closed pane → fall back to first pane in tree (depth-first)
6. If that was the last pane in the tab → remove the tab entirely (tabs always have at least one pane)

---

## React Components

### Component Tree

```
Workspace                          manages tabs, renders TabBar + active Tab
├── TabBar                         horizontal tab strip with overflow
│   └── TabItem × N               single tab: click, middle-click close, drag reorder
│       ├── TabRenameInput         inline input on double-click
│       └── TabContextMenu         Rename / Close / Close Others / Close All
└── Tab                            resolves tab's layout, provides tab context, owns recursive renderer
    └── (recursive layout renderer, inline in Tab.tsx)
        ├── [if pane]  Pane        data boundary: resolves pane, wires handlers
        │   ├── PaneHeader         toolbar content + close + active state + context menu
        │   │   ├── PaneRenameInput    inline input on double-click title
        │   │   └── PaneContextMenu    Close / Split Right / Split Down + registered items
        │   └── PaneContent        calls registry renderPane
        └── [if split] flex container + SplitHandle → recurse
```

**Responsibility boundaries:**
- `Workspace` — tab-level state (active tab, add/remove tabs). Renders empty state when no tabs exist. Doesn't know about panes.
- `Tab` — resolves one tab's layout tree, provides tab context to children. Owns the recursive layout renderer. Tabs always have at least one pane (closing last pane closes the tab).
- `Pane` — data/handler boundary. Resolves pane from flat map, builds `RendererContext`, wires handlers (close, focus, rename, pin, split). Children are presentational.
- `PaneHeader` / `PaneContent` — presentational. Receive resolved data + callbacks as props, don't touch the store.

### File Structure (co-located per AGENTS.md)

```
packages/pane-layout/src/react/components/
└── Workspace/
    ├── Workspace.tsx
    ├── index.ts
    └── components/
        ├── TabBar/
        │   ├── TabBar.tsx
        │   ├── index.ts
        │   └── components/
        │       └── TabItem/
        │           ├── TabItem.tsx
        │           ├── index.ts
        │           └── components/
        │               ├── TabRenameInput/
        │               │   ├── TabRenameInput.tsx
        │               │   └── index.ts
        │               └── TabContextMenu/
        │                   ├── TabContextMenu.tsx
        │                   └── index.ts
        ├── Tab/
        │   ├── Tab.tsx            (resolves layout, recursive renderer)
        │   ├── index.ts
        │   └── components/
        │       ├── Pane/
        │       │   ├── Pane.tsx           (data boundary: resolves pane, wires handlers)
        │       │   ├── index.ts
        │       │   └── components/
        │       │       ├── PaneHeader/
        │       │       │   ├── PaneHeader.tsx
        │       │       │   ├── index.ts
        │       │       │   └── components/
        │       │       │       ├── PaneRenameInput/
        │       │       │       │   ├── PaneRenameInput.tsx
        │       │       │       │   └── index.ts
        │       │       │       └── PaneContextMenu/
        │       │       │           ├── PaneContextMenu.tsx
        │       │       │           └── index.ts
        │       │       └── PaneContent/
        │       │           ├── PaneContent.tsx
        │       │           └── index.ts
        │       └── SplitHandle/
        │           ├── SplitHandle.tsx
        │           └── index.ts
```

### Types

```ts
type ContextMenuItem =
  | {
      type?: "item";
      label: string;
      icon?: ReactNode;
      variant?: "default" | "destructive";
      onSelect: () => void;
      shortcut?: string;          // display-only hint (e.g. "⌘K") — actual keybinding is owned by the pane
      disabled?: boolean;
    }
  | { type: "separator" }
  | {
      type: "submenu";
      label: string;
      icon?: ReactNode;
      items: ContextMenuItem[];   // nested items (e.g. "Move to Tab ›")
    };

interface RendererContext<TData> {
  pane: Pane<TData>;
  tab: Tab<TData>;
  isActive: boolean;
  store: StoreApi<WorkspaceStore<TData>>;  // escape hatch for advanced cases

  actions: {
    close: () => void;          // checks onBeforeClose guard first, then calls store.closePane
    focus: () => void;
    setTitle: (title: string) => void;
    pin: () => void;
    updateData: (data: TData) => void;
    splitRight: (newPane: Pane<TData>) => void;
    splitDown: (newPane: Pane<TData>) => void;
  };
}

interface PaneDefinition<TData> {
  renderPane(context: RendererContext<TData>): ReactNode;
  renderToolbar?(context: RendererContext<TData>): ReactNode;
  getTitle?(context: RendererContext<TData>): ReactNode;
  getIcon?(context: RendererContext<TData>): ReactNode;
}

type PaneRegistry<TData> = Record<string, PaneDefinition<TData>>;

// Workspace-level props (passed to <Workspace>)
interface WorkspaceProps<TData> {
  store: StoreApi<WorkspaceStore<TData>>;
  registry: PaneRegistry<TData>;
  renderTabAccessory?: (tab: Tab<TData>) => ReactNode;  // custom tab UI (status dot, badge, etc.)
  renderEmptyState?: () => ReactNode;                    // shown when no tabs exist
  renderAddTabMenu?: () => ReactNode;                     // dropdown content for "+" button in tab bar
  // ...other callbacks as needed
}
```

**Notes:**
- `renderToolbar` — full eject. If provided, replaces the entire PaneHeader content (icon, title, actions — everything). For panes that need a completely custom header (e.g. browser with nav buttons + URL bar). Most panes don't need this — the default header uses `getIcon()` + `getTitle()` + split/close buttons.
- `context.actions` — pre-wired imperative actions. `close()` checks the close guard (if registered via `useOnBeforeClose`) first, then calls the store's raw `closePane`.
- `store` on context is an escape hatch — pane implementations should use `context.actions.*` for normal operations.
- The `Pane` component (data boundary) builds the full `RendererContext` so pane implementations never need to know about `tabId` or call store methods directly.

**Pane hooks** (react-dnd style — spec + deps, framework handles registration/cleanup):

```ts
// Close guard — return false to cancel close (e.g. show "Save changes?" modal)
useOnBeforeClose(context, async () => {
  if (!isDirty) return true;
  return await showSaveDialog();
}, [isDirty]);

// Context menu items — registered from inside the render tree (access to refs)
useContextMenuActions(context, [
  { label: "Refresh", onSelect: () => webviewRef.current?.reload() },
], []);
```

Both hooks store the handler/items via a ref on the `Pane` component (through context). Cleanup on unmount is automatic. `PaneContextMenu` renders default items (Close, Split Right, Split Down) + items from `useContextMenuActions`, after a separator.

### Visual Reference (v1 components to match)

These v1 files are the styling targets — the new components should match their look 1:1:

| New Component | Reference File | What to match |
|---|---|---|
| `PaneHeader` | `apps/desktop/.../TabView/mosaic-theme.css` | `.mosaic-window-toolbar` (28px height, `var(--color-tertiary)` bg, focused = `var(--color-secondary)`) |
| `PaneHeader` (layout) | `apps/desktop/.../TabView/components/BasePaneWindow/BasePaneWindow.tsx` | Toolbar wrapper pattern, focus/split/close handler wiring |
| `PaneHeader` (title) | `apps/desktop/.../TabView/components/PaneTitle/PaneTitle.tsx` | Editable title, `text-sm text-muted-foreground`, double-click to rename |
| `PaneHeader` (actions) | `apps/desktop/.../TabView/components/PaneToolbarActions/PaneToolbarActions.tsx` | Split + close buttons, `rounded p-0.5 text-muted-foreground/60` |
| `PaneRenameInput` | `apps/desktop/.../WorkspaceSidebar/RenameInput/RenameInput.tsx` | Shared inline rename input (Enter/Escape/blur, auto-focus + select) |
| `TabBar` | `apps/desktop/.../TabsContent/GroupStrip/GroupStrip.tsx` | `h-10` tab strip, scroll overflow, fixed `160px` tab width |
| `TabItem` | `apps/desktop/.../TabsContent/GroupStrip/GroupItem.tsx` | Tab item styles, context menu (inline), middle-click close |
| `SplitHandle` | `apps/desktop/.../TabView/components/MosaicSplitOverlay/MosaicSplitOverlay.tsx` | 20px hit area, 1px `after:bg-border` line on hover, double-click equalize |
| `PaneContextMenu` | `apps/desktop/.../TabsContent/TabContentContextMenu.tsx` | Pane right-click menu structure |

### PaneHeader behavior

- **Default**: `getIcon()` + `getTitle()` on left, split + close buttons on right
- **Full eject**: if `renderToolbar()` is provided, replaces entire header content
- Focus state driven by `pane.id === tab.activePaneId`
- Click anywhere: `context.actions.focus()`
- Right-click: `PaneContextMenu`
- Future DnD: entire header becomes drag handle

---

## Implementation Plan

### Phase 1: Rename + gut the package

1. Rename `packages/pane-layout/` → `packages/panes/` and `@superset/panes` → `@superset/panes` in `package.json`
2. Delete all existing source files in `src/` (types, store, react components, tests)
3. Update the import in `apps/desktop/package.json` from `@superset/panes` to `@superset/panes`
4. Stub `src/index.ts` so the build doesn't break

### Phase 2: Types + Store (no React)

1. `src/types.ts` — `Pane`, `Tab`, `WorkspaceState`, `LayoutNode`, `SplitDirection`, `SplitPosition`, `ContextMenuItem`
2. `src/core/store/utils.ts` — tree traversal helpers: find pane in layout tree, find parent split, collapse empty splits, find first pane (depth-first)
3. `src/core/store/store.ts` — `createWorkspaceStore()` with all actions (tab CRUD, pane CRUD, split/resize/equalize, replacePane, replaceState)
4. `src/core/store/store.test.ts` — full test suite (see Tests section)
5. `src/index.ts` — export types + store

Run `bun test` — all store tests pass before touching React.

### Phase 3: React components

1. `src/react/types.ts` — `RendererContext`, `PaneDefinition`, `PaneRegistry`, `WorkspaceProps`
2. `src/react/hooks/` — `useOnBeforeClose`, `useContextMenuActions`, zustand `useStore` wrapper
3. Build component tree top-down:
   - `Workspace/Workspace.tsx` — reads store, renders `TabBar` + `Tab`
   - `Workspace/components/TabBar/` — tab strip with overflow, `TabItem`, `TabRenameInput`, `TabContextMenu`
   - `Workspace/components/Tab/` — resolves layout, recursive renderer
   - `Workspace/components/Tab/components/Pane/` — data boundary, builds `RendererContext`
   - `Workspace/components/Tab/components/Pane/components/PaneHeader/` — default header with icon/title/actions, full eject via `renderToolbar`
   - `Workspace/components/Tab/components/Pane/components/PaneContent/` — calls `definition.renderPane()`
   - `Workspace/components/Tab/components/SplitHandle/` — resize divider
4. `src/index.ts` — export React components + hooks

Run `bun run typecheck` — package compiles.

### Phase 4: Hook up desktop app

1. Update `apps/desktop/package.json` import
2. Update collection schema (`dashboardSidebarLocal/schema.ts`) — change `PaneWorkspaceState` → `WorkspaceState` import
3. Update `pane-viewer.model.ts` — pane factory functions (`createFilePane`, `createTerminalPane`, etc.) to return new `Pane<TData>` shape
4. Update `PaneViewer.tsx` — new pane registry with `renderPane`, `getTitle`, `getIcon`, `renderToolbar` (for browser)
5. Update `useV2WorkspacePaneLayout.ts` — swap `createPaneWorkspaceStore` → `createWorkspaceStore`, update type references. Persistence sync pattern stays the same.
6. Update all callsites using old store actions — search for `addPaneToGroup`, `splitGroup`, `groupId`, `addRoot`, `removeRoot`, `setActiveRoot`
7. Write the README.md into `packages/panes/README.md`

Run `bun run typecheck` from root, `bun run lint:fix`, manual test in desktop app.

### What stays untouched
- `apps/desktop/.../CollectionsProvider/` collection structure (workspaceId, sidebarState) — just update the type import
- The bidirectional persistence sync pattern in `useV2WorkspacePaneLayout` — same `replaceState` + `store.subscribe` approach
- All pane content components (terminal, chat, browser, file viewer) — they just get the new `RendererContext` interface

---

## Drag-and-Drop (future — not part of first push)

DnD is out of scope for the initial implementation but the model is designed to support it. Here's the plan for when we add it.

### Store action

```ts
movePaneBySplit: (args: {
  sourcePaneId: string;
  targetTabId: string;
  targetPaneId: string;
  position: SplitPosition;
}) => void;
```

Atomically: remove source pane from its current location (layout + panes map, collapse empty splits), then split the target pane and insert the moved pane at the given position. Works cross-tab (move entry between tabs' `panes` maps).

No path adjustment needed (unlike react-mosaic) because we use IDs, not paths.

### UI behavior

- **Dragging over the tab bar** → `setActiveTab(hoveredTabId)` to switch tabs during drag (with small delay to avoid flicker), so you can see the target tab's panes before dropping
- **Dragging over a pane's content area** → show split preview overlay (4 edge zones: top/right/bottom/left highlighted based on mouse position within the pane rect). This is local React state on the drop target, not store state.
- **Drop** → calls `movePaneBySplit` with the resolved target
- **Cancel / invalid drop** → no-op, source pane stays where it was

### Component changes for DnD

**`PaneHeader`**
- The entire header bar is the drag handle (same pattern as v1's MosaicWindow toolbar)
- On drag start: store `{ tabId, paneId }` in drag item

**`Pane`**
- Wraps each pane in a drop target
- On drag hover: tracks mouse position within the pane rect, determines which edge zone (top/right/bottom/left) is closest, shows a split preview overlay highlighting that zone
- On drop: calls `movePaneBySplit({ sourcePaneId, targetTabId, targetPaneId, position })`

**`TabBar` / `TabItem`**
- Each tab item is a drop target
- On drag hover (with ~300ms delay): calls `setActiveTab(hoveredTabId)` to switch the visible tab
- Visual indicator that the tab will activate (e.g. subtle highlight)

**`Workspace`**
- Wraps the whole workspace in the DnD provider (e.g. `DndProvider` from react-dnd or equivalent)

### Library choice (TBD)

- `react-dnd` — used by react-mosaic, proven for panel layouts
- `@dnd-kit` — modern, better touch/keyboard support
- Native HTML drag — simplest, fewer features

---

## Tests

### Tab operations
- Add tab, verify it appears in state
- Remove active tab → falls back to neighbor
- Remove only tab → `activeTabId` becomes null
- Set active tab
- Set tab title override

### Pane operations
- Set active pane within a tab
- Get pane by ID (searches across all tabs)
- Get active pane (with and without explicit tabId)
- Set pane data in-place (flat map update, no layout change)
- Set pane title override
- Pin a pane via `setPanePinned`
- Replace unpinned pane data via `replacePane` (preview behavior)
- Replace is no-op if target pane is pinned

### Split operations
- Split a single pane → creates split node with `weights: [1, 1]`
- Split right/left → horizontal direction, correct child order
- Split top/bottom → vertical direction, correct child order
- Split within existing same-direction split → halves target weight, inserts adjacent
- Split with custom weights
- Split with `selectNewPane: false` → focus stays on original
- Resize split (update weights array)
- Equalize split → all weights become `1`

### Collapsing
- Close pane in 2-pane split → split collapses to remaining leaf
- Close pane in 3-pane split → child + weight removed, split stays
- Close last pane in tab → tab is removed entirely
- `activePaneId` falls back to sibling after close

### Edge cases
- Invalid IDs (tab, pane, split) are all no-ops
- Replace state wholesale via `replaceState`
- Operations on empty tab (null layout)
- Duplicate pane ID insertion is no-op

---

## Verification

1. `bun test` in `packages/pane-layout` — all tests pass
2. `bun run typecheck` — all packages type-check
3. `bun run lint:fix` — clean lint
4. Manual: open desktop app → tabs render → panes render without group tab strips → splitting works → closing panes collapses splits → persistence round-trips

---


## Pane Lifecycle Notes

**Cleanup on close (terminal kill, editor cleanup):**
Pane components handle their own cleanup via React unmount (`useEffect` return). When `closePane` removes a pane from state, React unmounts the component, which triggers cleanup (e.g. terminal calls `kill` on unmount, editor cleans up document state). The store doesn't need type-specific cleanup logic.

**Devtools auto-close when browser closes:**
The devtools pane component reactively watches `store.getPane(targetPaneId)`. When it returns null (browser pane was closed), the devtools pane calls `context.actions.close()` to self-close. No coupling in the store — devtools owns this behavior.

---

## README.md (for `packages/panes/`)

````md
# @superset/panes

A generic, headless workspace layout engine. Tabs hold panes arranged in split layouts. The package provides the data model, store, and React components — you provide the pane content.

## Concepts

```
Workspace
├── Tab (chat, terminal, etc.)
│   ├── Pane A ──┐
│   ├── Pane B   ├── split layout (horizontal/vertical, n-ary, weighted)
│   └── Pane C ──┘
├── Tab
│   └── Pane D (single pane, no splits)
└── ...
```

- **Workspace** — top-level container. Holds tabs, tracks the active tab.
- **Tab** — a named workspace context. Each tab has a split layout of panes and a flat pane data map.
- **Pane** — a leaf in the layout tree. Typed with your own data (`TData`). Rendered by a registry of pane definitions.
- **Layout tree** — purely structural. Describes how panes are arranged (splits + weights) but holds no pane data — just `paneId` references into the tab's flat `panes` map.

## Quick Start

### 1. Define your pane data type

```tsx
type MyPaneData =
  | { kind: "editor"; filePath: string }
  | { kind: "terminal"; sessionId: string }
  | { kind: "browser"; url: string };
```

### 2. Create a pane registry

The registry tells the layout engine how to render each pane kind:

```tsx
import type { PaneRegistry } from "@superset/panes";

const registry: PaneRegistry<MyPaneData> = {
  // Simple pane — just title + icon, default header
  terminal: {
    renderPane: (ctx) => <Terminal sessionId={ctx.pane.data.sessionId} />,
    getTitle: () => "Terminal",
    getIcon: () => <TerminalIcon />,
  },

  // Extra toolbar actions (pin button before split/close)
  editor: {
    renderPane: (ctx) => <CodeEditor file={ctx.pane.data.filePath} />,
    getTitle: (ctx) => ctx.pane.data.filePath.split("/").pop(),
    getIcon: (ctx) => <FileIcon />,
    renderToolbarActions: (ctx) => (
      !ctx.pane.pinned && <PinButton onClick={() => ctx.actions.pin()} />
    ),
  },

  // Full toolbar eject (browser needs nav buttons + URL bar)
  browser: {
    renderPane: (ctx) => <Webview url={ctx.pane.data.url} />,
    renderToolbar: (ctx) => <BrowserToolbar context={ctx} />,
    getTitle: (ctx) => ctx.pane.data.url,
    getIcon: () => <GlobeIcon />,
  },
};
```

### 3. Create the store

```tsx
import { createWorkspaceStore, createTab, createPane } from "@superset/panes";

const store = createWorkspaceStore<MyPaneData>({
  initialState: {
    version: 1,
    tabs: [
      createTab({
        titleOverride: "My Tab",
        panes: [
          createPane({ kind: "terminal", data: { kind: "terminal", sessionId: "abc" } }),
        ],
      }),
    ],
    activeTabId: null, // auto-set to first tab
  },
});
```

### 4. Render the workspace

```tsx
import { Workspace } from "@superset/panes";

function App() {
  return (
    <Workspace
      store={store}
      registry={registry}
      renderAddTabMenu={() => (
        <DropdownMenu>
          <DropdownMenuItem onSelect={() => addTerminalTab()}>
            <TerminalIcon /> Terminal
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => addChatTab()}>
            <ChatIcon /> Chat
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => addBrowserTab()}>
            <GlobeIcon /> Browser
          </DropdownMenuItem>
        </DropdownMenu>
      )}
      renderTabAccessory={(tab) => <StatusDot tab={tab} />}
    />
  );
}
```

That's it. You get a tab bar, split panes with resizable handles, pane headers with close buttons, and context menus — all wired up.

## Data Model

### Layout Tree

The layout is a tree of split nodes and pane leaves:

```ts
type LayoutNode =
  | { type: "pane"; paneId: string }
  | { type: "split"; id: string; direction: "horizontal" | "vertical"; children: LayoutNode[]; weights: number[] };
```

Splits are **n-ary** (not binary) — a 3-way split is `children: [A, B, C], weights: [1, 1, 1]`, not nested binary nodes.

**Weights** are relative, not percentages. `[1, 1, 1]` = equal thirds. `[3, 2]` = 60/40. They don't need to sum to any specific value — CSS `flex-grow` handles the proportional rendering.

### Pane

```ts
interface Pane<TData> {
  id: string;
  kind: string;           // maps to a key in your PaneRegistry
  titleOverride?: string; // overrides getTitle() from registry
  pinned?: boolean;       // unpinned panes can be replaced in-place (preview mode)
  data: TData;            // your pane-specific state
}
```

### Tab

```ts
interface Tab<TData> {
  id: string;
  titleOverride?: string;
  createdAt: number;
  activePaneId: string | null;
  layout: LayoutNode | null;
  panes: Record<string, Pane<TData>>;  // flat map — layout tree references these by paneId
}
```

The **flat `panes` map** is separate from the layout tree. The tree is purely structural (`paneId` references), pane data lives in the map. This gives you O(1) pane lookup and clean separation of layout vs data.

## Store

The store is a vanilla zustand `StoreApi` (not a React hook store). This is intentional:
- Stable reference — created once, passed as a prop
- Subscribable from both React (`useStore`) and non-React code (`store.subscribe`)
- Works with any persistence layer (localStorage, IndexedDB, TanStack DB, etc.) via `replaceState` for hydration and `store.subscribe` for writes

Create it with `createWorkspaceStore()` and pass it to `<Workspace>`.

### Tab actions

```ts
store.getState().addTab(tab)
store.getState().removeTab(tabId)
store.getState().setActiveTab(tabId)
store.getState().setTabTitleOverride(tabId, title)
store.getState().getTab(tabId)
store.getState().getActiveTab()
```

### Pane actions

```ts
store.getState().setActivePane(tabId, paneId)
store.getState().getPane(paneId)          // searches across all tabs
store.getState().getActivePane(tabId?)
store.getState().closePane(tabId, paneId) // removes from layout + panes, collapses empty splits
store.getState().setPaneData(paneId, data)
store.getState().setPaneTitleOverride(tabId, paneId, title)
store.getState().setPanePinned(tabId, paneId, pinned)
store.getState().replacePane(tabId, paneId, newPane) // swap unpinned pane in-place, no-op if pinned
```

### Split actions

```ts
store.getState().splitPane(tabId, paneId, position, newPane, weights?)
// position: "top" | "right" | "bottom" | "left"
// splits the target pane, steals space from it (other panes untouched)

store.getState().addPane(tabId, pane, position?, relativeToPaneId?)
// ergonomic wrapper — splits relative to a target, or appends to edge

store.getState().resizeSplit(tabId, splitId, weights)
store.getState().equalizeSplit(tabId, splitId) // sets all weights to 1
```

### Bulk

```ts
store.getState().replaceState(newState)
store.getState().replaceState((prev) => ({ ...prev, ... }))
```

## Pane Registry

Each pane kind registers how it renders:

```ts
interface PaneDefinition<TData> {
  renderPane(context: RendererContext<TData>): ReactNode;     // required — the pane content
  getTitle?(context: RendererContext<TData>): ReactNode;       // derived title (titleOverride wins)
  getIcon?(context: RendererContext<TData>): ReactNode;        // icon in the pane header
  renderToolbar?(context: RendererContext<TData>): ReactNode;  // full eject — replaces entire header content
}
```

## RendererContext

Every registry method receives a `RendererContext` with the pane's data and pre-wired actions:

```ts
interface RendererContext<TData> {
  pane: Pane<TData>;
  tab: Tab<TData>;
  isActive: boolean;
  store: StoreApi<WorkspaceStore<TData>>;  // escape hatch

  actions: {
    close: () => void;
    focus: () => void;
    setTitle: (title: string) => void;
    pin: () => void;
    updateData: (data: TData) => void;
    splitRight: (newPane: Pane<TData>) => void;
    splitDown: (newPane: Pane<TData>) => void;
  };
}
```

Use `context.actions.*` for normal operations. The `store` is an escape hatch for advanced cases (e.g. setting a tab title from within a pane).

## Hooks

Use these inside your pane components to register behavior with the layout engine:

### useOnBeforeClose

Register a close guard. Return `false` to cancel the close (e.g. show a "Save changes?" dialog):

```tsx
function EditorPane({ context }: { context: RendererContext<MyPaneData> }) {
  const isDirty = useDirtyState();

  useOnBeforeClose(context, async () => {
    if (!isDirty) return true;
    return await showSaveConfirmation(); // returns true/false
  }, [isDirty]);

  return <CodeEditor />;
}
```

### useContextMenuActions

Register pane-specific context menu items. These appear after the default items (Close, Split Right, Split Down):

```tsx
function BrowserPane({ context }: { context: RendererContext<MyPaneData> }) {
  const webviewRef = useRef<WebviewTag>(null);

  useContextMenuActions(context, [
    { label: "Refresh", icon: <RefreshIcon />, shortcut: "⌘R", onSelect: () => webviewRef.current?.reload() },
    { type: "separator" },
    { label: "Open in External Browser", icon: <ExternalIcon />, onSelect: () => shell.openExternal(context.pane.data.url) },
  ], [context.pane.data.url]);

  return <webview ref={webviewRef} src={context.pane.data.url} />;
}
```

Context menu items support:
- `variant: "destructive"` — red text styling
- `shortcut` — display-only keyboard hint (e.g. `"⌘K"`)
- `disabled` — grayed out
- `type: "separator"` — visual divider
- `type: "submenu"` — nested menu with `items`

## Splitting

When you split a pane, the new pane steals space from the target. Other panes are untouched.

```ts
// Single pane → 50/50 split
store.getState().splitPane(tabId, "pane-a", "right", newPane);
// Result: horizontal split, weights [1, 1]

// Already in a same-direction split → target's weight is halved
// Before: horizontal [3, 2, 1], split pane[1] right
// After:  horizontal [3, 1, 1, 1]
```

Position determines direction and order:
- `"left"` / `"right"` → horizontal split
- `"top"` / `"bottom"` → vertical split
- `"left"` / `"top"` → new pane goes first
- `"right"` / `"bottom"` → new pane goes second

## Preview Panes (Pin/Unpin)

Unpinned panes can be replaced in-place without creating a new split — useful for file preview (click a file → replaces the preview pane, double-click or edit → pins it):

```ts
// Find any unpinned file pane in the tab
const preview = Object.values(tab.panes).find(p => p.kind === "file" && !p.pinned);

if (preview) {
  store.getState().replacePane(tabId, preview.id, newFilePane);
} else {
  store.getState().splitPane(tabId, activePaneId, "right", newFilePane);
}
```

Pin from inside a pane component (e.g. on first edit):

```tsx
context.actions.pin();
```

## Workspace Props

```ts
<Workspace
  store={store}
  registry={registry}
  renderTabAccessory={(tab) => ReactNode}   // custom UI in each tab (status dot, badge, etc.)
  renderEmptyState={() => ReactNode}        // shown when no tabs exist
  renderAddTabMenu={() => ReactNode}          // dropdown content for "+" button in tab bar
/>
```
````

---

## Follow-up Tasks (not part of first push)

1. **Drag-and-drop** — see DnD section above
2. **Reopen closed tab** — add `closedTabsStack: ClosedTab[]` to `WorkspaceState` and `reopenClosedTab()` action. Snapshot tab + panes on close, restore with fresh IDs. Persist stack so it survives app restarts.
