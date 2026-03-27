# Pane Layout Model Comparison

## Goal

Compare the data model and API shape of:

1. `react-mosaic`
2. `FlexLayout`
3. Our proposed Superset pane-layout implementation

This doc is intentionally focused on the core model and API, not styling.

Reference files used:

- React Mosaic
  - `/tmp/react-mosaic/libs/react-mosaic-component/src/lib/types.ts`
  - `/tmp/react-mosaic/libs/react-mosaic-component/src/lib/Mosaic.tsx`
  - `/tmp/react-mosaic/libs/react-mosaic-component/src/lib/util/mosaicUpdates.ts`
  - `/tmp/react-mosaic/libs/react-mosaic-component/src/lib/util/mosaicUtilities.ts`
- FlexLayout
  - `/tmp/FlexLayout-ref/src/model/IJsonModel.ts`
  - `/tmp/FlexLayout-ref/src/model/Model.ts`
  - `/tmp/FlexLayout-ref/src/model/Actions.ts`
  - `/tmp/FlexLayout-ref/src/model/Node.ts`
  - `/tmp/FlexLayout-ref/src/model/TabSetNode.ts`

---

## React Mosaic

### Data Model

React Mosaic is fundamentally a tree-first layout model.

Its current core type is:

```ts
type MosaicNode<T> =
  | MosaicSplitNode<T>
  | MosaicTabsNode<T>
  | T;
```

Where:

- split nodes are n-ary and store:
  - `direction`
  - `children`
  - optional `splitPercentages`
- tab containers store:
  - `tabs: T[]`
  - `activeTabIndex`
- leaves are just keys of type `T`

Important characteristics:

- The tree is the source of truth.
- Leaf content is not embedded in the tree. The tree only stores keys.
- Tree updates are path-based with `MosaicPath = number[]`.
- Update operations are expressed as tree mutations rather than a semantic window/group model.

### API Shape

The public API is renderer-first:

- `renderTile`
- `renderTabToolbar`
- `renderTabButton`
- `onChange`
- `onRelease`

The action surface is effectively:

- tree update specs
- remove/hide/show/expand operations
- renderer callbacks

There is no first-class concept of:

- multiple roots
- persisted workspace session
- drag session object
- pane descriptors with metadata
- explicit group ids

### Strengths

- Very simple tree contract
- Strong utility layer for tree updates
- Paths and split geometry are well-defined
- Tabs are integrated into the tree rather than bolted on

### Limits For Superset

- No multi-root session model
- Path-based identity is not enough for our cross-root drag requirement
- Leaf nodes are just keys, so the app has to own all pane metadata elsewhere
- API is oriented around a single mosaic instance, not a whole workspace session

---

## FlexLayout

### Data Model

FlexLayout also uses a nested persisted model, but it is richer and more IDE-oriented.

Its persisted JSON root is:

```ts
type IJsonModel = {
  global?: IGlobalAttributes;
  borders?: IJsonBorderNode[];
  layout: IJsonRowNode;
  popouts?: Record<string, IJsonPopout>;
};
```

The main nested model is:

- `row`
- `tabset`
- `tab`

Important characteristics:

- Persisted state is nested JSON, not normalized maps.
- The model includes optional borders and popouts.
- Tabs store config data inside tab nodes.
- Active/maximized tabsets can be represented in persisted JSON.

### Runtime Model

FlexLayout’s runtime model is more than the JSON suggests.

Internally it keeps:

- an `idMap: Map<string, Node>`
- a `windows: Map<string, LayoutWindow>`
- a `rootWindow`
- active/maximized tabset tracking per window

So the actual architecture is:

- nested tree for persistence
- indexed runtime model for operations

### API Shape

The public action API is semantic and id-based:

- `addNode`
- `moveNode`
- `deleteTab`
- `deleteTabset`
- `selectTab`
- `setActiveTabset`
- `adjustWeights`
- `createWindow`
- `closeWindow`
- `popoutTab`
- `popoutTabset`

This is much closer to a full workbench model than Mosaic.

### Strengths

- Good separation between durable JSON and runtime indexes
- Id-based actions are better than pure path-based tree updates
- Explicit support for multiple windows/popouts
- Explicit docking targets and richer drag/drop semantics

### Limits For Superset

- The model is coupled to FlexLayout-specific concepts:
  - borders
  - popouts
  - tabsets as the dominant abstraction
- The runtime model is object-heavy and class-based
- The API assumes FlexLayout’s own renderer and interaction rules
- The window model is oriented around browser popouts rather than our app-managed workbench roots

---

## Our Implementation

### Public Data Model

Our public persisted model should be tree-first, but one level higher than either library because our product requirement starts with multiple roots rendered as top-level tabs.

```ts
type PersistedPaneWorkspaceState<TPaneData> = {
  version: 1;
  roots: PaneRootState<TPaneData>[];
  activeRootId: string | null;
};

type PaneRootState<TPaneData> = {
  id: string;
  root: PaneLayoutNode<TPaneData>;
  activeGroupId: string | null;
};

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

type PaneState<TPaneData> = {
  id: string;
  kind: string;
  titleOverride?: string;
  pinned?: boolean;
  data: TPaneData;
};
```

There is no persisted or store-owned drag session in the core model.

### Public API Shape

The package should expose:

- a platform-agnostic `core`
- a React `renderer`

Core API:

- types
- reducer actions
- serialization helpers
- geometry/drop-target helpers
- runtime index builders

React API:

- workspace renderer
- per-root renderer
- customization hooks for pane content, tab chrome, and group/root chrome

### Runtime Model

Like FlexLayout, we should maintain derived runtime indexes:

```ts
type RuntimeIndexes = {
  groupPathById: Map<string, number[]>;
  paneLocationById: Map<string, { rootId: string; groupId: string; paneIndex: number }>;
};
```

These are an implementation detail, not the persisted contract.

### Drag Boundary

Because roots are top-level tabs inside one React tree, transient drag state can live in the renderer drag layer rather than the core store.

The core still needs:

- semantic `DropTarget` types
- geometry helpers for resolving drop targets
- final mutations like `movePane(...)` and `splitGroup(...)`

The renderer owns:

- drag monitor state
- overlay previews
- root-tab hover activation before drop

### Why This Differs From React Mosaic

#### 1. We have a workspace-level root model

Defense:

- Mosaic models one layout tree, not a multi-root session.
- Our product requirement starts with multiple roots, so `PaneWorkspaceState` must exist as a first-class layer.
- Putting roots outside the model would make persistence, focus, and cross-root moves much messier.

#### 2. We use stable ids for actions, not only paths

Defense:

- Mosaic’s path-based updates are elegant for one tree, but paths are too volatile for multi-step drop operations and cross-root moves.
- Stable ids let reducer actions remain valid even if normalization or collapse changes the path shape.
- We can still derive paths internally when tree surgery needs them.

#### 3. Group nodes inline their panes

Defense:

- This keeps the public model readable and self-contained.
- It avoids making the persisted contract overly normalized for the sake of reducer convenience.
- It is closer to the actual user mental model: “this group contains these tabs.”

#### 4. We store pane descriptors, not just leaf keys

Defense:

- Our pane engine needs to persist pane identity and restore metadata directly.
- Using only keys would force every consumer to maintain a second authoritative pane registry outside the layout.
- That is acceptable for a generic tile library, but too indirect for a workbench engine.

#### 5. We use `titleOverride` rather than making a computed `title` mandatory

Defense:

- A mandatory stored title duplicates pane metadata and creates stale-title risk.
- Most pane titles should be derived from pane data by the adapter or renderer layer.
- We only need durable title state when the user explicitly renames or overrides the default title.

### Why This Differs From FlexLayout

#### 1. We have a workspace/session root above roots

Defense:

- FlexLayout’s window story is centered around popouts attached to a single model.
- Our product wants explicit app-managed roots as part of the workbench session.
- A workspace-level root makes root order, active root, and cross-root moves explicit.

#### 2. We do not expose borders or popouts in the v1 contract

Defense:

- They are not part of our required product scope.
- Including them early would distort the core model around features we do not plan to ship first.
- This keeps the model focused on editor-group style panes.

#### 3. We do not make tabsets the dominant top-level concept

Defense:

- In our model, the more important abstraction is the `group` as a workbench leaf.
- A group happens to render tabs, but it is semantically a split leaf in a rooted workbench.
- This better matches the distinction we need between:
  - workspace
  - root
  - group
  - pane

#### 4. We use plain reducer/state objects, not class-heavy node models

Defense:

- We need the engine to be easy to run in web and desktop, easy to test, and easy to serialize.
- Pure data + reducers is a better fit for React app state, deterministic tests, and local persistence.
- We can still adopt FlexLayout’s runtime lesson and maintain derived indexes without copying its class hierarchy.

#### 5. We do not put drag session state in the core store

Defense:

- Our roots are tabs in one React tree, so `react-dnd` or equivalent can own transient hover state cleanly.
- Keeping hover state out of the core model avoids overfitting the engine to one drag implementation.
- The core still owns semantic `DropTarget` types and final mutations, which keeps the actual drop behavior deterministic and testable.

#### 6. We do not persist `rootOrder` separately from `roots`

Defense:

- If root order matters, an ordered `roots[]` array is enough.
- Keeping both `roots` and `rootOrder` in the durable schema creates two sources of truth.
- We can still derive a `Map<rootId, root>` at runtime for efficient lookup.

### Summary

React Mosaic is the simpler tree-first reference.

FlexLayout is the richer workbench reference, and the most important lesson from it is:

- keep the durable model nested
- keep runtime indexes explicit
- keep action semantics id-based

Our implementation should combine those lessons with our own product requirements:

- top-level multi-root session
- tree-first persisted roots
- inline groups and panes in the public model
- derived runtime indexes
- renderer-owned transient drag state with core-owned drop semantics
- platform-agnostic core plus React renderer

That is the model I would treat as “correct” for Superset, even where it diverges from both reference libraries.
