# Pane Layout API And Test Plan

## Goal

Define a shippable Superset pane-layout package before we continue implementation.

This package must support:

1. Multiple roots
2. A VS Code-like layout inside each root
3. Cross-root drag and drop
4. A shared engine usable from both web and Electron
5. Both an API layer and a React component layer

The current spike package is **not** the contract. It was useful to surface the missing top-level abstraction: `roots`.

## Product Requirements

### Required

- Multiple workbench roots rendered as top-level tabs
- Each root owns a split layout made of pane groups
- Each group owns multiple pane tabs
- One active group per root
- One active pane per group
- Dragging a pane over another root tab activates that root and lets the drag continue there
- Advanced docking previews
- Renderer layer must be design-system-native, using Tailwind + `@superset/ui`

### Nice Later

- Floating utility panes inside the pane-layout engine
- Full keyboard command parity with VS Code

### Non-Goals For V1

- Generic third-party docking framework compatibility
- Reproducing every FlexLayout or Mosaic feature
- Edge/border tabsets
- Arbitrary free-floating panes
- Detached/popout windows

## Package Shape

Use one workspace package:

- `@superset/pane-layout`

It should expose two layers:

- `core`
  - pure TypeScript types
  - reducer/state transitions
  - persistence/serialization helpers
  - drop target and geometry helpers
- `react`
  - top-level root tab strip component
  - per-root layout component
  - group/tab chrome built from `@superset/ui`
  - drop target visuals and drag affordances

The package must remain platform-agnostic:

- no Electron imports
- no OS-window orchestration baked into core
- no desktop route assumptions

Electron and web should both be able to render the same `PaneWorkspaceState`.

## Store Strategy

This package is internal to Superset. It does not need an external-consumer-neutral API.

So the recommended integration surface is:

- Zustand-first store API
- pure reducer/helpers underneath

That gives us:

- ergonomic React usage
- selectors and subscriptions
- easier adoption across web and desktop teams
- deterministic tests against pure state transitions

Recommended layering:

- `createPaneWorkspaceStore(...)`
- `usePaneWorkspaceStore(...)`
- internal pure helpers:
  - `reducePaneWorkspace(...)`
  - `buildRuntimeIndexes(...)`
  - `normalizePaneWorkspace(...)`
  - `serializePaneWorkspace(...)`

The reducer/helpers should remain implementation details that the Zustand store delegates to.

## Core Model

There are two nested models:

1. `PaneWorkspaceState`
2. `PaneRootState`

### Workspace Layer

This is the top-level persisted state object.

```ts
type PersistedPaneWorkspaceState<TPaneData> = {
  version: 1;
  roots: PaneRootState<TPaneData>[];
  activeRootId: string | null;
};
```

This layer owns:

- root membership
- active root
- serialization of the whole workbench session

It does **not** own transient drag state.

### Root Layer

Each root contains a VS Code-like pane layout.

```ts
type PaneRootState<TPaneData> = {
  id: string;
  root: PaneLayoutNode<TPaneData>;
  activeGroupId: string | null;
};
```

### Layout Tree

```ts
type PaneLayoutNode<TPaneData> =
  | {
      type: "group";
      id: string;
      activePaneId: string | null;
      panes: PaneState<TPaneData>[];
    }
  | {
      type: "split";
      id: string;
      direction: "horizontal" | "vertical";
      sizes: number[];
      children: PaneLayoutNode<TPaneData>[];
    };
```

Notes:

- Use an n-ary split tree, not a fixed binary tree.
- `sizes.length` must equal `children.length`.
- This gives us room to support balanced groups and future reflow without rewriting the model.
- The public durable model should stay tree-first.
- Group membership should be inline with the group node, not split into separate top-level records.
- Group preview state should be derivable from pane metadata rather than stored separately.

### Pane Layer

```ts
type PaneState<TPaneData> = {
  id: string;
  kind: string;
  titleOverride?: string;
  pinned?: boolean;
  data: TPaneData;
};
```

The engine should not know terminal/browser/file semantics. Those stay in app-specific pane data.

`titleOverride` is optional. Default pane titles should be derived by the renderer or adapter layer from pane data.

## Runtime Indexes

After digging into FlexLayout and Mosaic internals, the right split is:

- persisted/public model: tree-first
- runtime engine: derived indexes for fast lookup

That is effectively how the reference libraries work:

- FlexLayout persists nested row/tabset/tab JSON, but maintains an internal `idMap`, window registry, and active-tabset tracking at runtime.
- Mosaic keeps the tree as the source of truth, but its update utilities rely heavily on path-based traversal and derived geometry helpers.

So for us, the engine should be allowed to derive and cache:

```ts
type RuntimeIndexes = {
  groupPathById: Map<string, number[]>;
  paneLocationById: Map<string, { rootId: string; groupId: string; paneIndex: number }>;
};
```

These should be recomputed from the tree or incrementally maintained by the reducer, but they should not define the public contract.

## Zustand Store Contract

Recommended store state:

```ts
type PaneWorkspaceStoreState<TPaneData> = {
  persisted: PersistedPaneWorkspaceState<TPaneData>;
};
```

Recommended constructor:

```ts
function createPaneWorkspaceStore<TPaneData>(args: {
  initialPersistedState: PersistedPaneWorkspaceState<TPaneData>;
}): StoreApi<PaneWorkspaceStore<TPaneData>>;
```

Recommended public store shape:

```ts
type PaneWorkspaceStore<TPaneData> = PaneWorkspaceStoreState<TPaneData> & {
  setPersistedState: (
    next:
      | PersistedPaneWorkspaceState<TPaneData>
      | ((
          prev: PersistedPaneWorkspaceState<TPaneData>,
        ) => PersistedPaneWorkspaceState<TPaneData>)
  ) => void;

  rehydrate: (state: PersistedPaneWorkspaceState<TPaneData>) => void;

  setActiveRoot: (rootId: string) => void;
  setActiveGroup: (args: { rootId: string; groupId: string }) => void;
  setActivePane: (args: {
    rootId: string;
    groupId: string;
    paneId: string;
  }) => void;

  splitGroup: (args: {
    rootId: string;
    groupId: string;
    position: "top" | "right" | "bottom" | "left";
    newPane: PaneState<TPaneData>;
    selectNewPane?: boolean;
  }) => void;

  addPaneToGroup: (args: {
    rootId: string;
    groupId: string;
    pane: PaneState<TPaneData>;
    index?: number;
    select?: boolean;
  }) => void;

  closePane: (args: {
    rootId: string;
    groupId: string;
    paneId: string;
  }) => void;

  movePane: (args: {
    paneId: string;
    targetRootId: string;
    targetGroupId: string;
    index?: number;
    select?: boolean;
  }) => void;

  resizeSplit: (args: {
    rootId: string;
    splitId: string;
    sizes: number[];
  }) => void;
};
```

## Selectors

We should provide a small selector layer because most consumers should not walk the tree manually.

Recommended selectors:

```ts
getRoot(rootId)
getActiveRoot()
getGroup(rootId, groupId)
getActiveGroup(rootId)
getPane(paneId)
getPaneLocation(paneId)
```

These can be exported as plain helper functions or prebuilt hooks.

## Drag And Drop Boundary

The core package does not need a first-class drag session.

Because roots are top-level tabs in one React tree, the renderer can own transient drag interaction through a DnD adapter such as `react-dnd`.

That means:

- hover state and overlay previews live in the renderer drag layer
- the persisted layout tree does not mutate during hover
- most pane/group components should stay stable during drag
- the core only owns final mutations and shared drop-target math

### What Lives In The Renderer Drag Layer

- pointer/drag sensors
- drag source wiring
- drop target wiring
- group/root hit-testing
- drag preview image
- overlay rendering
- translating geometry into semantic `DropTarget`

### What Lives In Store State

- persisted layout
- active root
- active groups and panes
- final mutations like `movePane(...)`, `splitGroup(...)`, and `closePane(...)`

### Why This Split Is Necessary

- Root activation on drag hover is product behavior, not native browser behavior.
- The renderer needs a stable source of truth for docking preview overlays.
- We do not want to mutate and rerender the actual layout tree on every hover frame.
- The same final drop behavior still needs deterministic reducer coverage.

### Required Drag Flow

1. `dragstart`
   - renderer starts a DnD gesture with the dragged pane id and source metadata

2. `dragenter` on a root tab
   - renderer can call `setActiveRoot(rootId)` to switch visible root

3. `dragenter` or `dragover` on a group target
   - renderer computes the semantic `DropTarget`
   - overlay components render the preview for that target

4. `drop`
   - renderer resolves the final operation from the `DropTarget`
   - renderer calls the matching mutation, typically `movePane(...)` or `splitGroup(...)`

5. `dragend`
   - renderer clears any local overlay state

### Important Clarification

The store should not directly manipulate DOM drag events or persist transient hover state.

The renderer adapter is responsible for:

- hit-testing and converting geometry into `DropTarget`
- calling the correct store methods on drop
- rendering preview overlays from drag-layer state

The store is responsible for:

- maintaining the persisted layout model
- exposing final mutations
- exposing shared geometry helpers for drop-target resolution when useful

## Drop Target Model

The core should still define the semantic drop result type used by the renderer:

```ts
type DropTarget =
  | { type: "group-center"; rootId: string; groupId: string }
  | {
      type: "split";
      rootId: string;
      groupId: string;
      position: "top" | "right" | "bottom" | "left";
    };
```

Important rules:

- Hovering another root can update `activeRootId` before drop completes.
- Hovering groups in any root must produce a visible docking preview target.
- The preview overlay should be the only thing that changes during hover; the real pane layout stays in place until drop.
- Drag/drop actions should target stable ids, not only paths, because paths are too volatile during multi-step edits and cross-root moves.

That final drop behavior should be driven by reducer actions, not by ad hoc renderer state.

## App Shell Boundary

Floating utility panes are out of scope for pane-layout v1.

For now, utility surfaces should live outside the pane-layout engine in the surrounding app shell, for example:

- sidebars
- inspectors
- bottom utility regions
- fixed toolbars

That remains a good assumption as long as those surfaces do not need to:

- move between roots
- dock into pane groups
- persist inside the same pane-layout model

If we ever need those behaviors, utility-pane support can be added later as a separate extension of the core model.

## Required Reducer Actions

### Workspace Actions

- `addRoot`
- `removeRoot`
- `setActiveRoot`
- `renameRoot`
- `rehydrateWorkspace`

### Group/Pane Actions

- `setActiveGroup`
- `setActivePane`
- `addPaneToGroup`
- `closePane`
- `movePaneToGroup`
- `movePaneToRoot`
- `splitGroup`
- `mergeGroups`
- `resizeSplit`

## React Component API

The React layer should not hide the model. It should render it.

Recommended exports:

```ts
type PaneWorkspaceProps<TPaneData> = {
  state: PaneWorkspaceState<TPaneData>;
  dispatch: (action: PaneLayoutAction<TPaneData>) => void;
  registry: PaneRegistry<TPaneData>;
  renderRootTab?: (args: PaneRootTabRenderArgs<TPaneData>) => ReactNode;
  renderGroupToolbar?: (args: PaneGroupToolbarRenderArgs<TPaneData>) => ReactNode;
};
```

```ts
type PaneRootProps<TPaneData> = {
  root: PaneRootState<TPaneData>;
  isActive: boolean;
  dispatch: (action: PaneLayoutAction<TPaneData>) => void;
  registry: PaneRegistry<TPaneData>;
};
```

### Renderer Components

The first pass should use a smaller, clearer renderer tree:

- `PaneWorkspace`
- `PaneRootTabs`
- `PaneRootView`
- `PaneNode`
- `PaneGroup`
- `PaneTabStrip`
- `PaneSurface`
- `PaneContent`
- `PaneEmptyState`

The package can still export lower-level internal pieces, but the public component API should match the actual render tree instead of pre-optimizing every subpart as a replaceable primitive.

### Exact Component Props

```ts
type PaneWorkspaceProps<TPaneData> = {
  state: PersistedPaneWorkspaceState<TPaneData>;
  dispatch: PaneDispatch<TPaneData>;
  registry: PaneRegistry<TPaneData>;
  className?: string;
  activeDropTarget?: DropTarget | null;
  renderRootTab?: (args: PaneRootTabRenderArgs<TPaneData>) => ReactNode;
  renderGroupToolbar?: (args: PaneGroupToolbarRenderArgs<TPaneData>) => ReactNode;
  renderEmptyState?: (args: PaneEmptyStateRenderArgs<TPaneData>) => ReactNode;
};

type PaneRootTabsProps<TPaneData> = {
  roots: PaneRootState<TPaneData>[];
  activeRootId: string | null;
  dispatch: PaneDispatch<TPaneData>;
  registry: PaneRegistry<TPaneData>;
  className?: string;
  renderRootTab?: (args: PaneRootTabRenderArgs<TPaneData>) => ReactNode;
};

type PaneRootViewProps<TPaneData> = {
  root: PaneRootState<TPaneData>;
  isActive: boolean;
  dispatch: PaneDispatch<TPaneData>;
  registry: PaneRegistry<TPaneData>;
  className?: string;
  activeDropTarget?: DropTarget | null;
  renderGroupToolbar?: (args: PaneGroupToolbarRenderArgs<TPaneData>) => ReactNode;
  renderEmptyState?: (args: PaneEmptyStateRenderArgs<TPaneData>) => ReactNode;
};

type PaneNodeProps<TPaneData> = {
  root: PaneRootState<TPaneData>;
  node: PaneLayoutNode<TPaneData>;
  dispatch: PaneDispatch<TPaneData>;
  registry: PaneRegistry<TPaneData>;
  activeDropTarget: DropTarget | null;
  renderToolbar?: (args: PaneGroupToolbarRenderArgs<TPaneData>) => ReactNode;
  renderEmptyState?: (args: PaneEmptyStateRenderArgs<TPaneData>) => ReactNode;
};

type PaneGroupProps<TPaneData> = {
  root: PaneRootState<TPaneData>;
  group: Extract<PaneLayoutNode<TPaneData>, { type: "group" }>;
  dispatch: PaneDispatch<TPaneData>;
  registry: PaneRegistry<TPaneData>;
  isFocused: boolean;
  activeDropTarget: DropTarget | null;
  renderToolbar?: (args: PaneGroupToolbarRenderArgs<TPaneData>) => ReactNode;
  renderEmptyState?: (args: PaneEmptyStateRenderArgs<TPaneData>) => ReactNode;
};

type PaneTabStripProps<TPaneData> = {
  root: PaneRootState<TPaneData>;
  group: Extract<PaneLayoutNode<TPaneData>, { type: "group" }>;
  dispatch: PaneDispatch<TPaneData>;
  registry: PaneRegistry<TPaneData>;
};

type PaneTabButtonProps<TPaneData> = {
  root: PaneRootState<TPaneData>;
  group: Extract<PaneLayoutNode<TPaneData>, { type: "group" }>;
  pane: PaneState<TPaneData>;
  dispatch: PaneDispatch<TPaneData>;
  registry: PaneRegistry<TPaneData>;
  isActive: boolean;
  isHovered: boolean;
};

type PaneSurfaceProps<TPaneData> = {
  root: PaneRootState<TPaneData>;
  group: Extract<PaneLayoutNode<TPaneData>, { type: "group" }>;
  pane: PaneState<TPaneData>;
  dispatch: PaneDispatch<TPaneData>;
  registry: PaneRegistry<TPaneData>;
  isActive: boolean;
  isFocused: boolean;
  activeDropTarget: DropTarget | null;
};

type PaneContentProps<TPaneData> = {
  root: PaneRootState<TPaneData>;
  group: Extract<PaneLayoutNode<TPaneData>, { type: "group" }>;
  pane: PaneState<TPaneData>;
  dispatch: PaneDispatch<TPaneData>;
  registry: PaneRegistry<TPaneData>;
  isActive: boolean;
  isFocused: boolean;
};

type PaneEmptyStateProps<TPaneData> = {
  root: PaneRootState<TPaneData>;
  groupId?: string;
  dispatch: PaneDispatch<TPaneData>;
  registry: PaneRegistry<TPaneData>;
};
```

### Pane Definition Registry

Pane-specific UI should be registered by pane `kind`, not stored in persisted pane state.

```ts
type PaneRegistry<TPaneData> = Record<string, PaneDefinition<TPaneData>>;

type PaneDefinition<TPaneData> = {
  renderPane: (args: PaneRenderArgs<TPaneData>) => ReactNode;
  getTitle?: (pane: PaneState<TPaneData>) => string;
  getIcon?: (pane: PaneState<TPaneData>) => ReactNode;
  renderHeaderActions?: (args: PaneHeaderActionsRenderArgs<TPaneData>) => ReactNode;
  renderTabActions?: (args: PaneTabActionsRenderArgs<TPaneData>) => ReactNode;
  renderEmptyState?: (args: PaneEmptyStateRenderArgs<TPaneData>) => ReactNode;
};
```

This is the right place to define things like:

- pane children/body content
- header actions
- tab-level trailing actions
- title/icon resolution
- pane-type-specific empty states

These are runtime rendering concerns, not durable layout state.

The important boundary is:

- `PaneSurface` owns the shared pane shell
- `PaneSurface` also owns the VS Code-like hover overlay
- `PaneContent` delegates arbitrary inner content to the pane registry
- `PaneDefinition.renderPane(...)` should not receive drop-target state

### Render Args

The pane renderer should receive enough context to render pane-local UI without reaching into layout internals:

```ts
type PaneRenderArgs<TPaneData> = {
  pane: PaneState<TPaneData>;
  root: PaneRootState<TPaneData>;
  groupId: string;
  isActive: boolean;
  isFocused: boolean;
};

type PaneHeaderActionsRenderArgs<TPaneData> = {
  pane: PaneState<TPaneData>;
  root: PaneRootState<TPaneData>;
  groupId: string;
  isActive: boolean;
};

type PaneTabActionsRenderArgs<TPaneData> = {
  pane: PaneState<TPaneData>;
  root: PaneRootState<TPaneData>;
  groupId: string;
  isActive: boolean;
  isHovered: boolean;
};

type PaneRootTabRenderArgs<TPaneData> = {
  root: PaneRootState<TPaneData>;
  isActive: boolean;
  dispatch: PaneDispatch<TPaneData>;
  registry: PaneRegistry<TPaneData>;
};

type PaneGroupToolbarRenderArgs<TPaneData> = {
  root: PaneRootState<TPaneData>;
  group: Extract<PaneLayoutNode<TPaneData>, { type: "group" }>;
  activePane: PaneState<TPaneData> | null;
  dispatch: PaneDispatch<TPaneData>;
  registry: PaneRegistry<TPaneData>;
};

type PaneEmptyStateRenderArgs<TPaneData> = {
  root: PaneRootState<TPaneData>;
  groupId?: string;
  dispatch: PaneDispatch<TPaneData>;
  registry: PaneRegistry<TPaneData>;
};

type PaneDispatch<TPaneData> = (action: PaneLayoutAction<TPaneData>) => void;
```

### How Arbitrary Pane Content Renders

`PaneContent` should be a thin resolver. It does not know what a terminal pane or browser pane is.

It should:

1. read `pane.kind`
2. resolve `registry[pane.kind]`
3. call `definition.renderPane(...)`
4. render the returned React subtree inside `PaneSurface`

Example:

```ts
function PaneContent<TPaneData>({
  root,
  group,
  pane,
  registry,
  isActive,
  isFocused,
}: PaneTabPanelProps<TPaneData>) {
  const definition = registry[pane.kind];

  if (!definition) {
    throw new Error(`Missing pane definition for kind: ${pane.kind}`);
  }

  return definition.renderPane({
    pane,
    root,
    groupId: group.id,
    isActive,
    isFocused,
  });
}
```

So if `pane.kind` is:

- `terminal`, the registry returns a terminal renderer
- `browser`, the registry returns a browser renderer
- `file`, the registry returns a file renderer

The panel shell stays generic. Only the registry-provided renderer knows what content to mount.

### End-To-End Rendering Model

The actual flow should be:

1. `PaneWorkspace`
   - renders the top-level root tabs
   - renders the active root
2. `PaneRootView`
   - recursively renders the root layout tree
3. `PaneNode`
   - if `split`, render split children
   - if `group`, render `PaneGroup`
4. `PaneGroup`
   - renders the tab strip
   - resolves the active pane
   - renders `PaneSurface`
5. `PaneSurface`
   - renders shared pane chrome
   - renders the drag-hover overlay for that pane surface
   - renders `PaneContent`
6. `PaneContent`
   - looks up `registry[pane.kind]`
   - mounts the pane-specific React subtree

So yes, every pane surface can show the VS Code-style hover effect, but that effect still belongs to the shared surface component, not to the pane-specific content renderer.

### Example Registry

```ts
type WorkspacePaneData =
  | { kind: "terminal"; sessionKey: string }
  | { kind: "browser"; url: string }
  | { kind: "file"; filePath: string; viewMode: "raw" | "rendered" | "diff" };

const paneRegistry: PaneRegistry<WorkspacePaneData> = {
  terminal: {
    getTitle: (pane) => pane.data.sessionKey,
    renderPane: ({ pane }) => <TerminalPane sessionKey={pane.data.sessionKey} />,
  },
  browser: {
    getTitle: () => "Preview",
    renderPane: ({ pane }) => <BrowserPane url={pane.data.url} />,
  },
  file: {
    getTitle: (pane) => pane.data.filePath,
    renderPane: ({ pane }) => (
      <FilePane filePath={pane.data.filePath} viewMode={pane.data.viewMode} />
    ),
  },
};
```

We should avoid a closed “magic” component API. The package must let apps customize:

- tab buttons
- tab toolbars
- group headers
- root tab chrome
- drag previews
- empty states

But core layout math and final drop semantics should stay owned by the package.

## Persistence

Persist the workspace model, not live runtime state.

Persist:

- roots
- per-root layout tree
- groups
- pane descriptors
- active ids

Do not persist:

- live terminal process attachment
- live browser navigation internals unless we explicitly choose session restore
- drag hover state
- DOM geometry caches

For v2 workspaces, persistence should remain device-local and keyed by `workspaceId`.

## Test Plan

We should copy the **shape** of FlexLayout and Mosaic’s test suites, not their implementation.

### 1. Core Reducer Tests

Inspired by:

- FlexLayout `tests/Model.test.ts`
- Mosaic `mosaicUpdates.spec.ts`
- Mosaic `mosaicUtilities.spec.ts`

We need exhaustive state transition tests for:

- adding panes to a group
- moving panes into another group
- splitting groups in each direction
- collapsing empty groups after close
- resizing split sizes
- moving panes between roots
- moving a pane within the same root
- preserving active pane/group/root rules
- serialization roundtrip

These should be pure unit tests with no DOM.

### 2. Tree Utility Tests

Inspired by:

- Mosaic `boundingBox.spec.ts`
- Mosaic `mosaicUtilities.spec.ts`

We need tests for:

- node lookup by path/id
- replacing a node in a tree
- removing a child and collapsing splits
- balancing or normalizing split trees
- geometric drop target calculation from bounding boxes

This is where we prove the layout math works.

### 3. Drag Interaction Tests

New for Superset because cross-root drag/drop is a core requirement.

We need component or integration tests for:

- hover over another group in same root
- hover over another root tab switches active root
- hover over another group produces the correct docking preview target
- hover over group edges produces top/right/bottom/left split targets
- drop into another group moves the pane correctly
- cancel drag leaves the layout unchanged

### 4. React Component Tests

Renderer tests should verify:

- active tab rendering
- close button dispatch
- split panels render recursively
- root tab activation styling
- empty group placeholder behavior
- drag enter handlers dispatch correct hover actions

These can be component tests with mocked dispatch and small sample states.

### 5. End-To-End Interaction Tests

Inspired by:

- FlexLayout `tests-playwright/view.spec.ts`

We should add Playwright-style interaction coverage once the package stabilizes.

Minimum scenarios:

1. Drag tab into another group center
2. Drag tab to group left/right/top/bottom split
3. Drag tab from root A into root B
4. Hovering root B activates it before drop
5. Resize split and persist/reload layout
6. Close active tab and ensure focus falls back correctly

The right lesson from FlexLayout is not “copy their tests”; it is:

- keep pure model tests and UI interaction tests separate
- make drag/drop scenarios explicit and exhaustive

## Reference Material

Downloaded locally for inspection:

- FlexLayout: `/tmp/FlexLayout-ref`
- react-mosaic: `/tmp/react-mosaic`

Useful reference files:

- FlexLayout model tests: `/tmp/FlexLayout-ref/tests/Model.test.ts`
- FlexLayout Playwright tests: `/tmp/FlexLayout-ref/tests-playwright/view.spec.ts`
- Mosaic update tests: `/tmp/react-mosaic/libs/react-mosaic-component/src/lib/util/mosaicUpdates.spec.ts`
- Mosaic utility tests: `/tmp/react-mosaic/libs/react-mosaic-component/src/lib/util/mosaicUtilities.spec.ts`
- Mosaic geometry tests: `/tmp/react-mosaic/libs/react-mosaic-component/src/lib/util/boundingBox.spec.ts`

These should be treated as behavioral inspiration only.

## Implementation Order

1. Lock the core API in `@superset/pane-layout`
2. Write reducer and tree utility tests first
3. Implement root-aware reducer
4. Implement minimal React renderer with `@superset/ui` primitives
5. Add same-root drag/drop
6. Add cross-root drag activation
7. Replace the v2 pane viewer with the new package
8. Add persistence and migration helpers
9. Add end-to-end drag/resize tests

## Recommendation

Proceed with a clean-room implementation of:

- a root-aware pane workspace core
- a Superset-specific React renderer
- a test suite modeled after FlexLayout’s model/e2e split and Mosaic’s tree utility coverage

Do **not** continue iterating on the current spike package until the API and test surface above are accepted.
