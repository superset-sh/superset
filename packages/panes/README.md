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

## Drag-and-Drop

`Workspace` uses `react-dnd` internally for tab reordering and pane dragging but does **not** include its own `DndProvider`. You must wrap `<Workspace>` in a `DndProvider` yourself:

```tsx
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

function App() {
  return (
    <DndProvider backend={HTML5Backend}>
      <Workspace store={store} registry={registry} />
    </DndProvider>
  );
}
```

This is intentional — embedding a provider inside `Workspace` would conflict with any parent `DndProvider` in your app (the HTML5 backend cannot be instantiated twice). Keeping it external lets you share a single backend across your entire component tree.

## Workspace Props

```ts
<Workspace
  store={store}
  registry={registry}
  renderTabAccessory={(tab) => ReactNode}   // custom UI in each tab (status dot, badge, etc.)
  renderEmptyState={() => ReactNode}        // shown when no tabs exist
  renderAddTabMenu={() => ReactNode}        // dropdown content for "+" button in tab bar
/>
```
