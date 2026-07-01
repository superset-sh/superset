# Explorer Drag Source (v2)

**Status:** Design / spec
**Scope:** `apps/desktop` renderer, v2 workspace UI
**Date:** 2026-06-28

## Problem

In the v2 workspace UI you can drop files from Finder into the main session
window (the terminal pane and the agent chat input both accept them), but you
cannot drag a file from the in-app Explorer (the file tree sidebar) into that
same window. Users have to leave the app and go to Finder to drag a path in.

## Summary

The **receiving** side is already built and stays untouched. Both drop targets
already accept a `text/plain` drag carrying a path:

- **Terminal pane** (`hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx`,
  `resolveDroppedText` / `handleDrop`): if `dataTransfer.files` is empty it reads
  `text/plain`, shell-escapes it, focuses the terminal, and pastes. `dragover`
  sets `dropEffect = "copy"`.
- **Agent chat input** (`...ChatPane/.../ChatInputFooter/components/ChatInputDropZone/ChatInputDropZone.tsx`
  + `hooks/useDocumentDrag/useDocumentDrag.ts`): a non-`Files` drag that includes
  `text/plain` is treated as a `"path"` drag; on drop it appends the path string
  to the prompt input and focuses.

The **missing** piece is purely a drag *source* on the Explorer. The Explorer is
rendered by `@pierre/trees` (`PierreFileTree`) inside an **open shadow root**, and
Pierre's own drag-and-drop is:

1. **Disabled** in our config (`FilesTab.tsx` never passes the `dragAndDrop`
   option to `usePierreFileTree`; Pierre defaults DnD off), and
2. The **wrong drag** even if enabled. Pierre's DnD is an in-tree *move* feature:
   on row `dragstart` it emits the row's **relative** path with
   `effectAllowed = "move"` and starts an internal move session. The receivers
   want the **absolute** path with `effectAllowed = "copy"`.

So the feature is: add an app-owned `dragstart` to the Explorer rows that emits
the absolute path with `copy` semantics, reusing the exact payload contract the
v1 Changes sidebar already uses (`ChangesView/hooks/useFileDrag.ts`).

## Approach

**Option B (chosen): app-owned row dragging; Pierre DnD stays off.**

We do not enable Pierre's `dragAndDrop`. Enabling it would start an internal move
session (selection/focus side effects, relative-path + `move` payload, tree drop
handlers, drag-hover-open) that we would immediately have to suppress, and
`canDrop: () => false` does not prevent the start-session side effects.

Instead we make the rows draggable ourselves, using the same
`composedPath()` + `data-item-path` technique the codebase already uses to reach
Pierre rows for clicks (`lib/clickPolicy/usePierreRowClickPolicy.ts`,
`FilesTab/hooks/useFilesTabDrop`).

**Feasibility (validated).** A Chromium/Electron check confirmed that setting
`draggable="true"` during the same gesture's `pointerdown` (bubble phase) is
early enough to produce a `dragstart` for that gesture. The only thing that would
block it is an earlier capture-phase `mousedown` that calls `preventDefault()`.
Pierre's document-capture `mousedown` listener is for closing context menus and
does not `preventDefault` for inside-tree clicks; Pierre's row `mousedown` only
`preventDefault`s for sticky rows or when search is open, and `FilesTab` sets
`search: false`.

### Rejected alternative

**Option A: enable Pierre DnD with `canDrop: () => false`, then override the
payload from a wrapper `dragstart` listener.** Less code, but it relies on Pierre
internals and listener ordering, and still incurs Pierre's start-session side
effects. Not worth the coupling.

## Design

A single FilesTab-local hook, `useFilesTabDragSource`, mirroring the sibling
`useFilesTabDrop`. It returns handlers that are spread onto the **existing**
FilesTab wrapper `<div>` (which already carries the inbound-upload
`onDragOver` / `onDragLeave` / `onDrop`). Pierre config is unchanged.

### Hook contract

```ts
// FilesTab/hooks/useFilesTabDragSource/useFilesTabDragSource.ts
interface UseFilesTabDragSourceOptions {
  rootPath: string;
}

interface UseFilesTabDragSourceResult {
  onPointerDownCapture: (e: React.PointerEvent) => void;
  onPointerUpCapture: (e: React.PointerEvent) => void;
  onPointerCancelCapture: (e: React.PointerEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}
```

### Behaviour

The hook keeps one ref, `stampedRowRef: HTMLElement | null` — the row we last set
`draggable="true"` on, so we can clean it up.

1. **`onPointerDownCapture`**
   - First, clear any previously stamped row: remove `draggable` from
     `stampedRowRef` and null it (defensive against a missed cleanup / recycled
     virtual rows).
   - Walk `e.nativeEvent.composedPath()` for the nearest element with a
     `data-item-path` attribute. If none, do nothing (header, empty space, or a
     non-row target stay non-draggable).
   - Set `draggable="true"` on that row element and store it in `stampedRowRef`.
   - Never call `preventDefault()` (that would suppress the drag).

2. **`onDragStart`** (bubbles from the row up to the wrapper)
   - Find the row again via `composedPath()` and read its `data-item-path`
     (Pierre's relative tree path).
   - If there is no row path or `rootPath` is empty, call
     `event.preventDefault()` and return, so a partial/empty drag does not start.
   - Convert with `toAbs(rootPath, treePath)` (from `FilesTab/utils/treePath`).
     `toAbs` already strips trailing slashes via `stripTrailingSlash`, so folder
     rows resolve to a clean absolute path with no extra handling.
   - Set the payload:
     - `dataTransfer.setData("text/plain", absolutePath)`
     - `dataTransfer.setData("application/x-superset-file-path", absolutePath)`
       (matches the v1 `useFileDrag` contract; harmless even though v2 receivers
       only read `text/plain`)
     - `dataTransfer.effectAllowed = "copy"`

3. **Cleanup — `onDragEnd`, `onPointerUpCapture`, `onPointerCancelCapture`**
   - Each removes `draggable` from `stampedRowRef` (if any) and nulls the ref.
   - Removal is idempotent. `onDragEnd` covers a completed drag;
     `onPointerUpCapture` / `onPointerCancelCapture` cover a plain click that
     stamped a row but never produced a `dragstart` (no `dragend` fires in that
     case), so recycled virtual rows never keep a stale `draggable`.

### Pure helper (for unit testing)

Extract the path resolution so the data logic is testable without a DOM:

```ts
// resolveRowDragPath(treePath: string | null, rootPath: string): string | null
//   returns the absolute path, or null when inputs are missing
```

The hook calls this helper in `onDragStart`; the helper just wraps `toAbs` with
null-guards. Unit-test the helper (relative file path, folder path with trailing
slash, empty/`null` inputs, empty `rootPath`), matching the repo's
`*.utils.test.ts` convention.

### Wiring

In `FilesTab.tsx`, construct the hook alongside `useFilesTabDrop` and spread its
handlers onto the same wrapper `<div>` that already owns the inbound-upload
handlers:

```tsx
const dragSource = useFilesTabDragSource({ rootPath });
// ...
<div
  className="relative flex h-full min-h-0 flex-col overflow-hidden"
  onClickCapture={handleClickCapture}
  onPointerDownCapture={dragSource.onPointerDownCapture}
  onPointerUpCapture={dragSource.onPointerUpCapture}
  onPointerCancelCapture={dragSource.onPointerCancelCapture}
  onDragStart={dragSource.onDragStart}
  onDragEnd={dragSource.onDragEnd}
  onDragOver={drop.onDragOver}
  onDragLeave={drop.onDragLeave}
  onDrop={drop.onDrop}
>
```

## Scope and non-goals (v1)

- **Single row only.** No multi-select drag. Pierre supports multi-selection and
  its built-in drag uses all selected paths, but the receivers are single-path
  oriented; start with one absolute path. Multi-select is a possible follow-up.
- **Folders are draggable** and drop as their absolute path (terminal `cd`
  friendly; chat inserts raw text). No folder-attachment semantics.
- **No custom drag preview** beyond the browser default.

## Edge cases

- No `data-item-path` under the pointer → no stamp, no drag.
- `onDragStart` with no resolved path or empty `rootPath` → `preventDefault()`,
  no drag.
- Inbound upload drop (`useFilesTabDrop`) only reacts to `Files`, so our
  `text/plain` drag never collides with it.
- `effectAllowed: "copy"` matches both receivers' `dropEffect: "copy"`, so the
  drop is permitted.
- Plain click that stamped a row but never dragged → cleared on
  `pointerup`/`pointercancel`.

## Testing

- **Unit:** `resolveRowDragPath` helper (file path, folder trailing-slash, null /
  empty inputs).
- **Manual verification:**
  - Drag a file from the Explorer onto a terminal pane → shell-escaped absolute
    path is pasted at the prompt.
  - Drag a file from the Explorer onto an agent chat input → absolute path is
    inserted into the prompt and focused.
  - Drag a folder → its absolute path drops the same way.
  - Plain-click rows repeatedly, then drag → no stale state, drag still works.

## Touched files

- **New:** `FilesTab/hooks/useFilesTabDragSource/useFilesTabDragSource.ts` (+ `index.ts`)
- **New:** pure helper + its `*.utils.test.ts`
- **Edit:** `FilesTab/FilesTab.tsx` (construct hook, spread handlers on wrapper)
- **Untouched:** all drop receivers (terminal pane, chat input drop zone), Pierre
  config.
