# V2 workspace panes architecture

## Goal

Implement VS Code-like panes for v2 workspaces without dragging over the legacy global tabs store design.

We need to answer:

1. Where pane layout/state should persist
2. What UI/state model should back VS Code-like panes
3. How pane types should be modeled so each pane kind can restore correctly


## Current state

- The new v2 workspace route is still a simple top-level view switcher in `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`.
- The legacy workspace UI already has a pane system, but its abstraction is `Tab -> Mosaic layout of Pane leaves`, backed by one global persisted store in app-state.
- The desktop renderer already uses TanStack collections for:
  - Electric-backed org/shared data
  - localStorage-backed per-org UI state such as dashboard sidebar project/workspace/section ordering
- The main process reads the legacy persisted tabs state for notification/pane resolution, which is one of the main reasons the old model is so coupled.


## Recommendation

### 1. Persistence story

Use **TanStack DB localStorage collections** for the authoritative persisted v2 pane layout, but only for **device-local, restoreable UI state**.

Do **not** use Electric/server-backed collections for panes yet.

Reasons:

- Pane layout is device-local. A terminal split setup on one device is not obviously correct on another device.
- Several pane kinds are fundamentally local-runtime objects:
  - terminal sessions
  - embedded browser webContents
  - devtools targets
- The renderer already has a clean pattern for local per-org UI persistence with `localStorageCollectionOptions`.
- A collection-based layout model is easier to query and evolve than another large persisted Zustand blob.

Do **not** persist everything. Split pane state into:

- `persisted`
  - split tree
  - group ordering
  - active pane ids
  - restoreable pane descriptors
  - lightweight view state that can be restored
- `runtime`
  - live terminal socket/session attachment state
  - browser loading/error/back-forward stack if we do not explicitly want session restore
  - unsaved editor buffer state
  - drag state / hover state / temporary preview transitions

### 2. Main-process access

Do not make the main-process app-state blob the source of truth for v2 panes.

Instead:

- Keep the authoritative persisted model in local TanStack collections
- Keep runtime registries in renderer/main for live objects
- Only mirror the **minimal lookup surface** into main if a specific feature needs it

Examples of minimal mirrored state:

- `workspaceId -> activePaneId`
- `chat sessionId -> paneId`
- `browser paneId -> target devtools paneId`

This avoids recreating the legacy coupling where every pane mutation must serialize a full snapshot into main-process app-state.

### 3. Suggested collections

Start with one persisted layout document per workspace.

Recommended collection:

- `v2WorkspacePaneLayouts`
  - storage key: `v2-workspace-pane-layouts-${organizationId}`
  - row key: `workspaceId`

Why one document per workspace:

- Pane updates are naturally workspace-scoped
- Restore/load is always by workspace
- Split tree + groups + panes are one consistency boundary
- Simpler migration story than multiple interdependent collections

If this becomes too coarse later, it can be split into `groups` and `panes` collections without changing the conceptual model.


## UI model

Use a VS Code-like model:

- A workspace has a **split tree**
- Leaves of the split tree are **pane groups**
- Each group has an ordered list of **pane tabs**
- Each group has one active pane
- The workspace has one active group / focused pane

This is meaningfully different from the legacy model:

- Legacy: tab contains a mosaic of panes
- Proposed: group is the split leaf, and panes are tabs within a group

That matches the mental model users already know from VS Code:

- split editor right/down
- move tab to group
- drag a tab to create a new group
- merge groups by dragging into a tab strip

### Proposed persisted shape

```ts
type WorkspacePaneLayoutDocument = {
  workspaceId: string;
  version: 1;
  root: PaneNode;
  groups: Record<string, PaneGroup>;
  panes: Record<string, PersistedPane>;
  activeGroupId: string | null;
  lastFocusedPaneId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PaneNode =
  | { type: "group"; groupId: string }
  | {
      type: "split";
      direction: "horizontal" | "vertical";
      first: PaneNode;
      second: PaneNode;
      ratio: number;
    };

type PaneGroup = {
  id: string;
  paneIds: string[];
  activePaneId: string | null;
  previewPaneId: string | null;
};
```

### Why groups instead of persisting Mosaic leaves directly

- The model reads like the product behavior
- It maps well to custom rendering or `react-mosaic-component`
- Pane-group operations become explicit
- Preview tab behavior is group-local, which is how VS Code works


## Pane type model

The current `PaneType` union is directionally right, but it is too flat if we want good restore semantics.

Recommended shift:

- keep a small top-level `kind`
- separate `input` from `viewState`
- keep runtime-only data out of the persisted pane record

### Suggested terminology

Rename:

- `"webview"` -> `"browser"` if this pane is really the in-app browser
- `"file-viewer"` -> `"file"` or `"editor"`

`webview` and `file-viewer` describe implementation details, not product concepts.

Suggested base union:

```ts
type PaneKind = "terminal" | "browser" | "file" | "chat" | "devtools";

type PersistedPane =
  | TerminalPane
  | BrowserPane
  | FilePane
  | ChatPane
  | DevtoolsPane;

type PaneBase<K extends PaneKind, Input, ViewState = undefined> = {
  id: string;
  kind: K;
  title?: string;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
  input: Input;
  viewState?: ViewState;
};
```

### File pane

```ts
type FilePane = PaneBase<
  "file",
  {
    path: string;
    mode: "editor" | "diff" | "preview";
    comparePath?: string;
    compareCommit?: string;
  },
  {
    line?: number;
    column?: number;
    scrollTop?: number;
  }
>;
```

Notes:

- This should be the main preview-tab candidate
- `mode` is part of the pane input, not the pane kind
- Later we can add markdown preview or image preview without inventing a new top-level kind

### Terminal pane

```ts
type TerminalPane = PaneBase<
  "terminal",
  {
    sessionKey: string;
    cwd?: string;
    launchMode: "workspace-shell" | "command" | "agent";
    command?: string;
  }
>;
```

Notes:

- Persist the terminal identity, not the PTY internals
- Restore by `attachOrCreate(sessionKey)`
- Terminal buffer and websocket state stay runtime-only

### Browser pane

```ts
type BrowserPane = PaneBase<
  "browser",
  {
    url: string;
    mode?: "docs" | "preview" | "generic";
  },
  {
    viewportPresetId?: string | null;
  }
>;
```

Notes:

- Persist current URL and maybe viewport
- Do not persist the full back/forward stack in v1 unless there is a strong UX reason

### Chat pane

```ts
type ChatPane = PaneBase<
  "chat",
  {
    sessionId: string | null;
  },
  {
    draftId?: string | null;
  }
>;
```

Notes:

- Persist the chat session identity
- Composer draft can be separate if we want independent retention rules
- Launch config should remain transient unless we explicitly want “restore unfinished launch”

### Devtools pane

```ts
type DevtoolsPane = PaneBase<
  "devtools",
  {
    targetPaneId: string;
  }
>;
```

Notes:

- This is the least durable pane type
- On restore, drop it if the target browser pane no longer exists
- It may even make sense to mark devtools as non-restorable initially


## Behavioral rules

### Preview behavior

Use VS Code-like preview semantics, but only where they make sense.

Suggested rule:

- file panes can open as preview
- browser panes can optionally reuse a preview pane
- chat, terminal, and devtools are always pinned

This keeps preview replacement from feeling destructive for long-lived panes.

### Group operations

Support these first:

1. open pane in current group
2. split current group right/down
3. move pane to existing group
4. drag pane to edge to create group
5. close pane
6. close group if empty

Do not start with more advanced VS Code behaviors like orthogonal nested drop overlays everywhere. The important thing is the state model, not perfect parity on day one.

### Restore rules

On workspace open:

1. load `v2WorkspacePaneLayouts[workspaceId]`
2. validate and normalize
3. rehydrate visible groups and active panes
4. lazily attach live runtimes for terminal/browser/chat panes when their group becomes active or visible

This avoids doing expensive restores for every hidden pane immediately.


## What not to do

- Do not reuse the legacy global tabs store shape for v2
- Do not make panes Electric-synced yet
- Do not persist volatile runtime state just because it exists in memory
- Do not encode behavior into `PaneType` names when it belongs in `input.mode`


## Implementation plan

### Phase 1: types and persistence

1. Add a new v2 pane model under the v2 workspace route/store code, separate from legacy `shared/tabs-types.ts`
2. Add `v2WorkspacePaneLayouts` localStorage collection
3. Add normalization helpers for missing groups, orphan panes, invalid active ids

### Phase 2: renderer store

Use a small local store for runtime state and commands:

- focused group id
- drag state
- live terminal/browser attachment state
- imperative actions like split, move, close, focus

The store should read/write the persisted layout document, but it should not own persistence itself.

### Phase 3: first pane kinds

Implement in this order:

1. file
2. terminal
3. chat
4. browser
5. devtools

That order gives the highest-value workspace behavior first and defers the trickiest host-coupled panes.

### Phase 4: bridge runtime services

Add small adapters:

- terminal pane -> attach/create session by `sessionKey`
- browser pane -> create/restore browser surface for `url`
- chat pane -> bind to `sessionId`
- devtools pane -> attach to target browser pane if present


## Decision summary

- Use **TanStack DB localStorage collections** for persisted v2 pane layouts
- Keep panes **device-local** for now
- Make the persisted model **workspace-scoped**
- Model the UI as **split tree -> groups -> pane tabs**
- Redefine pane types around **kind + input + viewState**
- Keep runtime state separate and only mirror minimal lookup data into main if needed
