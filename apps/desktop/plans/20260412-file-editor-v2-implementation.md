# File Editor v2 — Implementation Spec

Tactical reference for the rebuild. Design rationale lives in `20260412-file-editor-v2-feature-audit.md` section 0. This doc is what you read when you're about to write code.

---

## 1. File layout

```
apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/
├── state/
│   └── fileDocumentStore/
│       ├── fileDocumentStore.ts          — module Map<key, Entry>, refcount, lifecycle
│       ├── useSharedFileDocument.ts      — React hook (acquire on mount, release on unmount)
│       ├── types.ts                      — Document, ContentState, DocumentEvents
│       └── index.ts
│
└── hooks/usePaneRegistry/components/FilePane/
    ├── FilePane.tsx                      — acquires document, resolves views, renders all chrome + active view
    ├── FilePane.types.ts                 — FilePaneData (filePath, viewId, forceViewId)
    ├── components/
    │   ├── FileViewToggle/               — segmented control, RTL
    │   ├── LoadingState/
    │   ├── ErrorState/                   — not-found, too-large, is-directory
    │   ├── ExternalChangeBar/
    │   ├── OrphanedBanner/
    │   ├── SaveErrorBanner/
    │   └── ConflictDialog/
    └── registry/
        ├── index.ts                      — resolveViews, ALL_VIEWS, orderForToggle
        ├── types.ts                      — FileView, ViewProps, Priority, FileMeta
        ├── resolveViews.ts
        ├── allViews.ts                   — import list
        └── views/
            ├── CodeView/
            │   ├── CodeView.tsx
            │   ├── index.ts              — exports FileView object
            │   └── components/
            │       └── CodeEditor/       — duplicated from v1 in stage 1
            │           ├── CodeEditor.tsx
            │           ├── createCodeMirrorTheme.ts
            │           ├── loadLanguageSupport.ts
            │           ├── CodeEditorAdapter.ts
            │           └── index.ts
            ├── MarkdownPreviewView/
            │   ├── MarkdownPreviewView.tsx
            │   ├── index.ts
            │   └── components/
            │       └── MarkdownSearch/   — view-owned find UI (ported from v1)
            ├── ImageView/
            │   ├── ImageView.tsx
            │   └── index.ts
            └── BinaryWarningView/
                ├── BinaryWarningView.tsx
                └── index.ts

# If a second view later needs CodeEditor (e.g., a CsvSourceView, HexRawView),
# promote it to registry/views/components/CodeEditor/ at that point — not preemptively.
```

---

## 2. Core types

### 2.1 Registry

```ts
// registry/types.ts

export type FileMeta = {
  size?: number;
  isBinary?: boolean;
};

export type DocumentKind = "text" | "bytes" | "custom";

export type Priority = "builtin" | "option" | "default" | "exclusive";

export const PRIORITY_RANK: Record<Priority, number> = {
  exclusive: 5,
  default: 4,
  builtin: 3,
  option: 1,
};

export type FileView = {
  id: string;
  label: string;
  match: (filePath: string, meta: FileMeta) => boolean;
  priority: Priority;
  documentKind: DocumentKind;
  Renderer: ComponentType<ViewProps>;
};

export type ViewProps = {
  document: SharedFileDocument;
  filePath: string;
  workspaceId: string;
  onDirtyChange: (dirty: boolean) => void;
};
```

### 2.2 Document

```ts
// state/fileDocumentStore/types.ts

export type ContentState =
  | { kind: "loading" }
  | { kind: "text";         value: string;      revision: string }
  | { kind: "bytes";        value: Uint8Array;  revision: string }
  | { kind: "not-found" }
  | { kind: "too-large" }
  | { kind: "is-directory" };

export type DocumentPhase = "loading" | "resolved" | "disposed";

export type SharedFileDocument = {
  // Identity
  readonly workspaceId: string;
  readonly absolutePath: string;

  // Lifecycle
  readonly phase: DocumentPhase;
  readonly content: ContentState;

  // State flags (any combination may be true simultaneously)
  readonly dirty: boolean;
  readonly pendingSave: boolean;
  readonly saveError: Error | null;
  readonly conflict: ConflictState | null;
  readonly orphaned: boolean;
  readonly hasExternalChange: boolean;

  // Metadata (for view resolution)
  readonly byteSize: number | null;
  readonly isBinary: boolean | null;

  // Content mutations
  setContent(next: string): void;
  save(opts?: { force?: boolean }): Promise<SaveResult>;
  reload(): Promise<void>;
  discard(): Promise<void>;
  resolveConflict(choice: "reload" | "overwrite" | "keep"): Promise<void>;

  // Subscription (React consumes via useSyncExternalStore)
  subscribe(listener: () => void): () => void;
  snapshot(): SharedFileDocument;
};

export type ConflictState = {
  diskContent: string;
  diskRevision: string;
};

export type SaveResult =
  | { status: "saved" }
  | { status: "conflict"; diskContent: string; diskRevision: string }
  | { status: "error"; error: Error };
```

### 2.3 Pane data

```ts
// FilePane.types.ts

export type FilePaneData = {
  kind: "file";
  filePath: string;              // absolute path
  mode: "editor";
  hasChanges: boolean;           // mirrored from document.dirty for tab indicator
  viewId?: string;               // user's toggle selection
  forceViewId?: string;          // escape hatch from BinaryWarningView "Open Anyway"
};
```

---

## 3. Document state machine

State flags are independent booleans. Multiple can be true at once. Transitions are driven by actions and external events.

### 3.1 Flag combinations (the interesting ones)

| Flags | Meaning | FilePane renders |
|---|---|---|
| `phase=loading` | initial load | `LoadingState` |
| `phase=resolved` + text content | normal | view mounted |
| `dirty` | user edited | dot in tab title |
| `pendingSave` | save in flight | subtle indicator; block close |
| `dirty` + `hasExternalChange` | user edited, disk also changed | `ExternalChangeBar` |
| `saveError` | last save failed (non-conflict) | `SaveErrorBanner` + view mounted |
| `conflict` | save failed with ETag mismatch | `ConflictDialog` (modal over view) |
| `orphaned` + `dirty` | file deleted externally, unsaved buffer preserved | `OrphanedBanner` + view mounted with buffer |
| `orphaned` + `!dirty` | file deleted externally, no edits | `OrphanedBanner` + view mounted with last content |
| `phase=resolved` + `not-found` | never existed (not deleted — new file from stale link) | `ErrorState reason=not-found` |
| `phase=resolved` + `too-large` | file exceeds read limit | `ErrorState reason=too-large` |

### 3.2 Transitions

```
[loading]
  ↓ readFile success
[resolved, content=text|bytes]
  ↓ setContent(next)
[resolved, content, dirty]
  ↓ save()
[resolved, content, dirty, pendingSave]
  ↓ writeFile success                     ↓ writeFile ETag mismatch       ↓ writeFile other error
[resolved, content]                       [resolved, content, dirty,       [resolved, content, dirty,
                                           conflict]                        saveError]
                                          ↓ resolveConflict("overwrite")
                                          [resolved, content, dirty, pendingSave]
                                          ↓ resolveConflict("reload")
                                          [resolved, content]

From [resolved, anything]:
  fs:events delete → orphaned=true
  fs:events rename → update absolutePath, preserve state
  fs:events update/create + dirty → hasExternalChange=true
  fs:events update/create + !dirty → auto reload → onDidResolve
  fs:events overflow → treat like update (re-check + reload)
```

### 3.3 Event handling (store-level)

**Constraint: v2 FilePane code uses `@superset/workspace-client` exclusively. No `electronTrpc`.** That's v1's IPC path. The whole point of the v2 architecture is that workspaces talk to the host service directly, not through Electron IPC. Any import of `electronTrpc*` in the new FilePane directory is a bug.

All tRPC calls go through the imperative client returned by `useWorkspaceClient().trpcClient`; all event-bus subscriptions go through `getEventBus(hostUrl, tokenFn)` from `@superset/workspace-client`. The store itself is module-level but must be initialized from inside a React context once (to capture the trpcClient and host URL resolver); after that it runs imperatively.

`packages/workspace-fs/src/watch.ts` already coalesces rapid-fire events, pairs delete+create sequences into `rename` events, and filters atomic-write false positives via `@parcel/watcher`. By the time we see a `delete` event it's a real delete, not a transient artifact. No debounced probe needed.

**Initialization pattern** (inside the v2 workspace route):

```tsx
// Some provider mounted inside v2-workspace/$workspaceId/ that initializes the store once
export function FileDocumentStoreProvider({ children }: { children: ReactNode }) {
  const { trpcClient } = useWorkspaceClient();
  const hostUrl = useWorkspaceHostUrl(workspaceId);

  useEffect(() => {
    if (!hostUrl) return;
    initializeFileDocumentStore({
      trpcClient,
      hostUrl,
      tokenGetter: () => getHostServiceWsToken(hostUrl),
    });
    return () => teardownFileDocumentStore();
  }, [trpcClient, hostUrl]);

  return <>{children}</>;
}
```

Once initialized, the store has what it needs to make imperative calls and subscribe to the event bus without any further React plumbing.

**Store-level event handling** (runs after init, one subscription per workspace host, not per-entry):

```ts
// Pseudocode inside fileDocumentStore.ts
function subscribeToFsEvents() {
  const bus = getEventBus(hostUrl, tokenGetter);
  bus.watchFs(workspaceId);

  const remove = bus.on("fs:events", workspaceId, (_wid, payload) => {
    for (const event of payload.events) {
      dispatchFsEvent(event);
    }
  });

  const release = bus.retain();

  return () => {
    remove();
    bus.unwatchFs(workspaceId);
    release();
  };
}

function dispatchFsEvent(event: FsWatchEvent) {
  for (const entry of entries.values()) {
    const affects =
      entry.absolutePath === event.absolutePath ||
      (event.kind === "rename" && entry.absolutePath === event.oldAbsolutePath);
    if (!affects) continue;

    switch (event.kind) {
      case "delete":
        entry.orphaned = true;
        notify(entry);
        break;

      case "rename":
        entry.absolutePath = event.absolutePath;
        if (entry.dirty) {
          entry.hasExternalChange = true;
        }
        // path updated; if not dirty, in-memory content still matches — no reload needed
        notify(entry);
        break;

      case "create":
      case "update":
      case "overflow":
        if (entry.dirty) {
          entry.hasExternalChange = true;
          notify(entry);
        } else {
          void reloadFromDisk(entry);
        }
        break;
    }
  }
}

async function reloadFromDisk(entry: DocumentEntry) {
  // Imperative tRPC call via the injected client — NOT electronTrpc
  const result = await trpcClient.filesystem.readFile.query({
    workspaceId: entry.workspaceId,
    absolutePath: entry.absolutePath,
  });
  // ... update entry.content + revision + notify
}
```

Orphan re-appearance: if a `create` event lands on an `orphaned` entry with a `dirty` buffer, clear `orphaned` but keep `dirty` (user still has unsaved edits over newly-written disk content; they can resolve via the conflict dialog on next save).

### 3.4 Dispose rules

- `releaseDocument` decrements refCount
- If `refCount === 0` AND `!dirty` AND `!orphaned` → tear down entry
- If `refCount === 0` AND (`dirty` OR `orphaned`) → entry remains alive until explicit `discard()` or `save()` clears the flags

This mirrors VS Code's `TextFileEditorModelManager.canDispose()` which blocks disposal on dirty models. Prevents losing unsaved buffers when the last tab closes.

---

## 4. View inventory

### 4.1 Launch views

| View id | Label | Matcher | Priority | `documentKind` | Notes |
|---|---|---|---|---|---|
| `image` | `Image` | `isImageFile(fp)` | `exclusive` | `bytes` | Suppresses alternatives |
| `binary-warning` | `Binary` | `meta.isBinary === true` | `exclusive` | `bytes` | "Open Anyway" → `forceViewId: "code"` |
| `markdown-preview` | `Preview` | `isMarkdownFile(fp)` | `option` | `text` | Yields to code; appears in toggle |
| `code` | `Code` *(labelled `Markdown` on `.md` via override)* | `() => true` | `builtin` | `text` | Universal fallback |

Label override note: the code view's static label is `"Code"`, but on markdown files the toggle should read `"Markdown"` (matching Cursor). Two options:
- **(a) Context-aware label**: `label: (filePath) => isMarkdownFile(filePath) ? "Markdown" : "Code"` — requires the label field to accept a function.
- **(b) Second registration**: register a `markdown-code` view with `match: isMarkdownFile`, `priority: "builtin"`, `label: "Markdown"` and pull `code`'s matcher to exclude markdown. Cleaner registry, more registrations.

Decision: **(a)**. Label becomes `string | ((filePath: string) => string)`, resolved at render time.

### 4.2 Priority choices (why each view uses what it does)

- `code` is `builtin` — beats `option`, loses to `default`. Wins on `.ts/.py/.md/etc` but yields to CSV grid, JSON form, etc.
- `markdown-preview` is `option` — the only tier below `builtin`. This is the one file type where we want the universal fallback to beat the specialist.
- `image` is `exclusive` — no alternatives. Future: user hits `Reopen With…` and sets `forceViewId: "code"` to open as text.
- `binary-warning` is `exclusive` — forces the warning gate before any rendering.

### 4.3 Future views

| View id | Matcher | Priority | `documentKind` |
|---|---|---|---|
| `csv-grid` | `*.csv`, `*.tsv` | `default` | `text` |
| `json-form` | `package.json`, `tsconfig.json`, etc. | `default` | `text` |
| `env-form` | `.env*` | `default` | `text` |
| `notebook` | `*.ipynb` | `exclusive` | `custom` |
| `sqlite` | `*.sqlite`, `*.db` | `exclusive` | `custom` |
| `pdf` | `*.pdf` | `exclusive` | `bytes` |
| `hex` | — (via `Reopen With…`) | `option` | `custom` |

Each future view = one new directory + one line in `allViews.ts`. No changes to `FilePane` or `resolveViews`.

### 4.4 Resolution

```ts
function resolveViews(filePath: string, meta: FileMeta): FileView[] {
  const matches = ALL_VIEWS.filter((v) => v.match(filePath, meta));
  const exclusives = matches.filter((v) => v.priority === "exclusive");
  if (exclusives.length > 0) return exclusives;
  return [...matches].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
}

function orderForToggle(views: FileView[]): FileView[] {
  return [...views].reverse();  // default ends up on the right (Cursor RTL)
}

function pickDefaultView(views: FileView[]): FileView {
  return views[0];  // first after priority sort
}
```

---

## 5. Responsibility split

### 5.1 `FilePane.tsx` owns

- Document acquisition via `useSharedFileDocument`
- View resolution via `resolveViews` + active view selection (`data.viewId ?? pickDefaultView(views).id`)
- `forceViewId` bypass for binary-warning "Open Anyway"
- Mirroring `document.dirty` back to `data.hasChanges` for the tab indicator
- **Content gating** — renders `LoadingState` / `ErrorState` and does NOT mount the active view until `document.content.kind ∈ {text, bytes}`
- **Chrome rendering** — `FileViewToggle` (when `views.length > 1`), `ExternalChangeBar`, `OrphanedBanner`, `SaveErrorBanner`, `ConflictDialog`
- **Close-pane save guard** — wires `usePaneRegistry.tsx:154` TODO via non-hook `fileDocumentStore.get()` + `document.save()`

### 5.2 `FileView.Renderer` owns

- Rendering `document.content.value` (text or bytes — view knows its kind)
- Reporting edits via `onDirtyChange` + `document.setContent`
- Handling `Cmd+S` via `document.save()`
- Find UI (mounted inside the view; zero FilePane involvement — CodeView uses CodeMirror's native search panel, MarkdownPreviewView ports v1's `MarkdownSearch`, ImageView has no find)
- Undo history, cursor, selection, scroll position
- Focus management
- View-specific context menu entries (if any)

### 5.3 `SharedFileDocument` owns

- File I/O (read, write, exists-probe)
- ETag / revision tracking
- Dirty detection (`currentContent !== savedContent`)
- External-change detection (fs:events subscription)
- Orphan detection (delete probe with 100ms debounce)
- Save state machine (`dirty` → `pendingSave` → `saved` | `saveError` | `conflict`)
- Refcount + lifetime rules (dispose blocked on dirty/orphaned)
- Event fan-out to subscribers

### 5.4 Find architecture note

VS Code's three-layer find (shared `FindReplaceState<T>`, shared `FindInput` DOM primitives, per-editor widget + search model) only pays off when you have multiple custom widgets with similar UX but different underlying engines. At launch we have two views with find: CodeView (CodeMirror's native search, fully baked) and MarkdownPreviewView (DOM-range search, ported from v1). Neither duplicates work — CodeMirror ships its own widget; the markdown search is small enough to own inline. No shared base needed at launch. Revisit when we ship a third view (CSV grid, notebook) whose find UI visibly resembles another view's.

---

## 6. Flows

### 6.1 Open

1. `FilesTab` click → `openFilePane(filePath, { openInNewTab })` in `page.tsx`
2. `FilePaneData = { filePath, mode: "editor", hasChanges: false, viewId: undefined }`
3. `FilePane.tsx` mounts
4. `useSharedFileDocument(workspaceId, filePath)` → `acquireDocument` → refcount 0→1
5. Store triggers async `filesystem.readFile`; initial state is `phase=loading`
6. `FilePane.tsx` first render: `document.content.kind === "loading"` → renders `LoadingState`, view does NOT mount
7. Read completes → `content.kind` transitions to `text`/`bytes`/`not-found`/`too-large`/`is-directory`; binary probe runs, sets `isBinary`
8. `resolveViews(filePath, { size, isBinary })` → matching view list
9. Active view renderer mounts with `document` + `filePath` props

### 6.2 Save

1. View calls `document.save()` (via CodeMirror keymap, TipTap keymap, etc.)
2. Document transitions: `dirty` → `dirty + pendingSave`
3. `filesystem.writeFile` with `precondition: { ifMatch: revision }`
4. **Success**: revision updates; `dirty = false`; `pendingSave = false`; `savedContent = currentContent`; subscribers notified; tab dirty-dot clears
5. **Conflict (ETag mismatch)**: `pendingSave = false`; `conflict = { diskContent, diskRevision }`; `dirty` stays true; `SaveErrorBanner` does NOT show; `ConflictDialog` shows
6. **Other error**: `pendingSave = false`; `saveError = error`; `dirty` stays true; `SaveErrorBanner` shows; view remains editable

### 6.3 Conflict resolution

- `resolveConflict("reload")` → `document.content = conflict.diskContent`; `currentContent = savedContent = diskContent`; `revision = diskRevision`; `dirty = false`; `conflict = null`
- `resolveConflict("overwrite")` → `document.save({ force: true })` which skips the `ifMatch` precondition
- `resolveConflict("keep")` → `conflict = null`, but `dirty` stays true (user keeps editing against stale revision; next save will conflict again unless merged)

### 6.4 View swap

1. User clicks inactive tab in `FileViewToggle`
2. `FileViewToggle` calls `onChangeView("preview")`
3. `FilePane.tsx`: `context.actions.updateData({ ...data, viewId: "preview" })`
4. Re-render: `activeView` recomputes; old Renderer unmounts; new Renderer mounts
5. `useSharedFileDocument` is on `FilePane`, NOT views → document stays alive; refcount unaffected
6. `document.currentContent`, `dirty`, `conflict`, `orphaned` all preserved across the swap
7. Per-view state (undo history, scroll, cursor, find query) does NOT carry over — each view has its own

### 6.5 External change (disk edited while editor is open)

- `fs:events` change for a held path:
  - `!dirty` → store calls `reloadFromDisk(entry)` silently; content updates; subscribers notified
  - `dirty` → `hasExternalChange = true`; `ExternalChangeBar` shows with Reload / Review Diff buttons
- User clicks Reload → `document.reload()` → discards in-memory buffer, loads disk content, clears `hasExternalChange` and `dirty`

### 6.6 External delete

- `fs:events` delete for a held path → `orphaned = true` immediately (watcher already filtered out atomic-write false positives)
- `OrphanedBanner` shows
- `dirty`: view stays mounted with unsaved buffer; user must `Save As` or `Discard`
- `!dirty`: view stays mounted with last-known content; user sees banner
- File re-appears on disk later (`create` event on orphaned entry):
  - `!dirty`: clear `orphaned`, reload content silently
  - `dirty`: clear `orphaned`, set `hasExternalChange = true`; user resolves via conflict dialog on next save

### 6.7 Close with dirty

1. User clicks close on a tab with `data.hasChanges === true`
2. `usePaneRegistry.onBeforeClose` reads `data.hasChanges`, returns an `alert(...)` Promise
3. Dialog: Save / Don't Save / Cancel
4. **Save** → calls `document.save()`; on success, resolves `true` (close proceeds); on conflict/error, resolves `false` (close blocked, banner shows)
5. **Don't Save** → calls `document.discard()` which forces refcount to allow teardown; resolves `true`
6. **Cancel** → resolves `false`

Blocker: `FilePane` holds the document; `onBeforeClose` runs on pane data only. Either expose a `documentHandle` via pane context, or have the store expose a non-hook `getDocument(workspaceId, filePath)` for non-React callers.

Decision: **non-hook store access** (`fileDocumentStore.get(workspaceId, filePath)`), used by `onBeforeClose`. Keeps the registry decoupled from React rendering.

---

## 7. FilePane component (concrete)

One component. Acquires the document, resolves views, gates on content state, renders chrome, mounts the active view.

```tsx
// FilePane.tsx

export function FilePane({ context, workspaceId }: FilePaneProps) {
  const data = context.pane.data as FilePaneData;
  const { filePath } = data;

  const document = useSharedFileDocument({ workspaceId, absolutePath: filePath });

  // View resolution
  const meta: FileMeta = {
    size: document.byteSize ?? undefined,
    isBinary: document.isBinary ?? undefined,
  };
  const views = data.forceViewId
    ? ALL_VIEWS.filter((v) => v.id === data.forceViewId)
    : resolveViews(filePath, meta);
  const activeView = views.find((v) => v.id === data.viewId) ?? pickDefaultView(views);
  const ViewRenderer = activeView.Renderer;

  // Handlers
  const handleChangeView = useCallback(
    (viewId: string) => {
      context.actions.updateData({ ...data, viewId } as PaneViewerData);
    },
    [context.actions, data],
  );
  const handleDirtyChange = useCallback(
    (dirty: boolean) => {
      if (dirty !== data.hasChanges) {
        context.actions.updateData({ ...data, hasChanges: dirty } as PaneViewerData);
      }
    },
    [context.actions, data],
  );

  // Content gating — view not mounted until there's renderable content
  if (document.content.kind === "loading") {
    return <LoadingState />;
  }
  if (document.content.kind === "not-found" && !document.orphaned) {
    return <ErrorState reason="not-found" />;
  }
  if (document.content.kind === "too-large") {
    return <ErrorState reason="too-large" />;
  }
  if (document.content.kind === "is-directory") {
    return <ErrorState reason="is-directory" />;
  }

  // Chrome + active view
  const showToggle = views.length > 1;
  return (
    <div className="flex h-full w-full flex-col">
      {showToggle && (
        <div className="flex items-center justify-end border-b border-border px-2 py-1">
          <FileViewToggle
            views={views}
            activeViewId={activeView.id}
            onChange={handleChangeView}
          />
        </div>
      )}
      {document.hasExternalChange && <ExternalChangeBar document={document} />}
      {document.orphaned && <OrphanedBanner document={document} />}
      {document.saveError && <SaveErrorBanner document={document} />}
      <div className="min-h-0 min-w-0 flex-1">
        <ViewRenderer
          document={document}
          filePath={filePath}
          workspaceId={workspaceId}
          onDirtyChange={handleDirtyChange}
        />
      </div>
      {document.conflict && <ConflictDialog document={document} />}
    </div>
  );
}
```

---

## 8. Build stages

Organized as thin-vertical-slice + grow-outward. Each PR lands something runnable and testable end-to-end — you can `bun dev`, open a file, see what changed. No refactor-only PRs. No half-wired intermediate states.

Ships behind a feature flag (`fileEditorV2Enabled` or similar) so the old v2 `CodeRenderer`/`MarkdownRenderer`/`ImageRenderer` path keeps working throughout the build. Flag flips in the final PR.

### PR 1 — Thin e2e slice (the hard one)

Build just enough to render one view end-to-end. Missing features are acknowledged and deferred; the point is to prove the stack works.

**Scope:**
- `fileDocumentStore` — minimum viable state machine: `phase`, `content`, `dirty`, refcount, subscribe, `acquireDocument`/`releaseDocument`/`get`, `save` via tRPC with ETag precondition. **Deferred**: `pendingSave`, `saveError`, `conflict`, `orphaned`, `hasExternalChange`, fs:events subscription.
- `useSharedFileDocument` hook
- Registry: `types.ts`, `resolveViews.ts`, `allViews.ts` containing only `codeView`
- Duplicated `CodeEditor.tsx` + deps at `registry/views/CodeView/components/CodeEditor/`
- `CodeView` component
- `FilePane.tsx` rewrite: acquire doc, resolve views, mount active view, minimal `LoadingState` gate
- Feature flag wiring: new path when flag is on, old path when off

**Acceptance:** flag on → open a `.ts` file, edit, Cmd+S saves, tab dirty dot appears and clears. Split the tab, open the same file in the other pane, edit in one, see the content sync in real time (refcount sharing works). Flag off → old behavior unchanged. This proves: store, registry, FilePane dispatch, shared buffer, save flow.

**Visible gaps (known, acceptable for this PR):** no markdown preview, no image view, no binary warning, no conflict dialog, no orphan handling, no external-change banner, no save-error banner, no toggle (only one view registered).

### PR 2 — Second view unlocks the toggle

Adds the registry's scaling proof: multiple views, the segmented toggle, shared document across view swaps.

**Scope:**
- `MarkdownPreviewView` (TipTap) + ported `MarkdownSearch` colocated inside the view dir
- `FileViewToggle` component
- `ImageView` (small, no toggle, but fits naturally here since it doesn't add complexity)

**Acceptance:** flag on → open a `.md` file, starts in code view labelled "Markdown", toggle appears on the right with "Preview · Markdown" RTL. Click Preview, content stays synced across the swap, edits in one view are visible in the other after toggling back. Open a `.png`, image renders, no toggle shown. This proves: multi-view registry, RTL toggle ordering, view swap preserves document state.

### PR 3 — State machine completion + chrome

Fills in the state machine fields that PR 1 deferred and builds all the banners/dialogs.

**Scope:**
- Expand `fileDocumentStore` with `pendingSave`, `saveError`, `conflict`, `hasExternalChange`
- `ExternalChangeBar` component
- `SaveErrorBanner` component
- `ConflictDialog` component (ported from v1's `FileSaveConflictDialog`)
- `ErrorState` component (not-found, too-large, is-directory)
- Close-pane save guard fix via non-hook `fileDocumentStore.get()` in `usePaneRegistry.tsx:154`

**Acceptance:** flag on → edit a file externally while v2 is showing it → `ExternalChangeBar` appears. Close a dirty tab → alert prompts save/discard/cancel, all three work. Simulate ETag mismatch (easiest: two tabs on the same file in two separate desktop processes, edit+save in both) → `ConflictDialog` shows. Open a nonexistent path → `ErrorState reason="not-found"`.

### PR 4 — fs:events + orphan + binary

Wires up the watcher and adds the last launch view.

**Scope:**
- `orphaned` flag on the store
- fs:events subscription in `fileDocumentStore` (the `switch` over `create | update | delete | rename | overflow` from §3.3)
- `OrphanedBanner` component
- Dispose rules: block teardown when `dirty` or `orphaned`
- Rename path tracking
- `BinaryWarningView` + `meta.isBinary` threading + `forceViewId` bypass

**Acceptance:** `rm` an open file from a terminal → `OrphanedBanner` appears immediately. Edit the file externally with `vim :w` → `rename` event fires, no phantom orphan banner, `ExternalChangeBar` shows instead. Close a dirty tab → dialog; "Don't Save" actually drops the buffer; "Save" persists and closes cleanly. Open a `.so` → `BinaryWarningView` shown; click "Open Anyway" → opens as code.

### PR 5 — Cleanup and flip

Mechanical. Deletes the old path.

**Scope:**
- Flip the feature flag default to on
- Delete `CodeRenderer.tsx`, `MarkdownRenderer.tsx`, `ImageRenderer.tsx`
- Delete v2's current `useFileDocument` host-service hook (if no non-FilePane consumers remain — verify first)
- Remove the feature flag entirely
- Clean up any dead imports / unused exports

**Acceptance:** no references to the old renderer components remain; typecheck passes; full regression suite (§9.2) runs clean.

### Post-launch follow-up PRs (each independently small)

- Context menu (audit §8): copy path, copy path:line, reveal in sidebar, open in external editor
- Hotkey wiring: Cmd+Shift+C (copy path:line), Cmd+Shift+R (reopen tab), prev/next tab, prev/next pane
- Link detection / Cmd+click on paths (audit §14, §15 tier 1)
- CSV grid view
- JSON form view for `package.json` / `tsconfig.json`
- `Reopen With…` menu for explicit handler override
- Per-glob user override setting (`fileViewOverrides`)
- Go-to-line command (Cmd+G)
- Sticky scroll extension
- Breadcrumb path in pane body

Each of these touches one view or one component in isolation and doesn't require coordinating across the stack.

### Why this shape

- **PR 1 is the big one** (~600–1000 lines, half of that is the duplicated CodeEditor). Reviewable. Ships a working surface.
- **PRs 2–4 each add testable user-visible behavior.** No refactor-only PRs. Every PR has an acceptance check you can run manually in `bun dev`.
- **Flag isolates risk.** Old path coexists until PR 5. If PR 3 breaks something, PR 4 can still merge with the flag off.
- **Intermediate states are honest.** After PR 2 the flag path is already a usable editor for the three main file types (code, markdown, image). After PR 3 it matches v1 for conflict + external-change handling. After PR 4 it matches or exceeds v1 for everything except context menu + hotkeys.
- **Follow-up PRs are actually small.** The coupled refactor work is done in PRs 1–5; everything after is single-feature additions.

---

## 9. Verification

### 9.1 Per-PR

- `bun typecheck` — must pass
- `bun run lint` — must pass
- `bun dev` → open v2 workspace → execute the PR's acceptance check
- Feature flag toggled off → regression check that old v2 still works unchanged

### 9.2 Regression suite (run after every PR)

Tests that map to which PR introduced them — not every check applies to every PR.

| Check | Introduced by |
|---|---|
| Open `.ts` file → code view, no toggle, Cmd+S saves | PR 1 |
| Split pane, open same file in both → edits sync, dirty dot on both | PR 1 |
| Open `.md` file → Markdown view default, toggle shows "Preview · Markdown" | PR 2 |
| Click Preview → TipTap renders same content, swap preserves dirty state | PR 2 |
| Open `.png` → image view, no toggle | PR 2 |
| Edit file externally → `ExternalChangeBar` appears | PR 3 |
| Edit file, close tab → save/discard/cancel prompt, all three work | PR 3 |
| ETag mismatch on save → `ConflictDialog` shows, all three resolutions work | PR 3 |
| Open nonexistent path → `ErrorState reason="not-found"` | PR 3 |
| `rm` open file from terminal → `OrphanedBanner` appears | PR 4 |
| `vim :w` → `rename` event fires, no phantom orphan banner | PR 4 |
| Open `.so` → binary warning + "Open Anyway" → code view | PR 4 |
| Feature flag off → old v2 path unchanged | PRs 1–4 |

### 9.3 Manual edge cases

- Empty file
- Very large file at the 2MB boundary
- File with CRLF vs LF line endings
- Symbolic link
- File whose name has unicode characters
- File in a deeply nested path
- File on a case-insensitive filesystem where case of filename changes externally

---

## 10. Open decisions

| # | Question | Default | Needs decision by |
|---|---|---|---|
| 1 | Label override: function-per-view or second registration? | function | PR 2 |
| 2 | Binary detection: sync-in-readFile or async-after-first-render? | sync-in-readFile | PR 4 |
| 3 | `viewId` persistence migration for existing v2 pane data? | additive, default `undefined`, no migration | PR 1 |
| 4 | Per-glob user override setting (`fileViewOverrides`)? | deferred post-launch | — |
| 5 | `Reopen With…` menu? | deferred post-launch | — |
| 6 | Per-view undo history vs unified? | per-view (matches VS Code) | PR 2 |
| 7 | Orphan auto-clear on file reappearance? | Resolved — see Flow 6.6: clear `orphaned`, silently reload if clean, flag `hasExternalChange` if dirty | — |
