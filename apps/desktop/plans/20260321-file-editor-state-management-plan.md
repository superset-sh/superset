# Desktop File Editor State Management Plan

## Goal

Centralize file-editor lifecycle state so unsaved changes, save conflicts, pane close, tab close, preview replacement, and view-mode switches all go through one decision path.

## Current Problem

- `FileViewerPane` owns dirty state, draft/baseline refs, save conflict state, and the unsaved dialog locally.
- `useTabsStore` owns pane removal, tab removal, preview reuse, and layout mutation.
- Because the workflow state and destructive actions live in different places, close paths cannot enforce unsaved-change handling consistently.

## State Boundaries

- Keep `useTabsStore` as the persisted pane/tab metadata store.
  - Owns file path, view mode, pinned state, diff metadata, focus, and layout.
  - Should not own draft content, dirty flags, save conflicts, or pending close intents.
- Add a renderer-only `useEditorDocumentsStore`.
  - Owns document state keyed by logical file identity, not pane.
  - Non-persisted.
- Add a renderer-only `useEditorSessionsStore`.
  - Owns pane-local session state keyed by `paneId`.
  - Non-persisted.
- Add an `editorBufferRegistry` module.
  - Owns current buffer content outside reactive global state.
  - Buffers are keyed by document key plus a `generation` token.
  - Prevents stale async work from leaking into a reused preview pane.

## Model

Split document state from pane session state.

- A document is the file being edited.
- A session is one pane viewing that document.

This scales better when the same file is open in multiple panes and keeps file lifecycle concerns separate from pane UI concerns.

### Document State

```ts
interface EditorDocumentState {
	documentKey: string;
	workspaceId: string;
	filePath: string;
	status: "loading" | "ready" | "saving" | "conflict";
	dirty: boolean;
	baselineRevision: string | null;
	hasExternalDiskChange: boolean;
	conflict: { diskContent: string | null } | null;
}
```

Owns:

- baseline revision
- external disk change state
- save conflict state
- derived dirty status

### Pane Session State

```ts
type EditorIntent =
	| { type: "close-pane" }
	| { type: "close-tab"; tabId: string }
	| { type: "replace-preview" }
	| { type: "change-view-mode"; nextMode: FileViewerMode }
	| { type: "quit-app" };

interface EditorSessionMeta {
	paneId: string;
	documentKey: string;
	generation: number;
	pendingIntent: EditorIntent | null;
	autoPinnedBecauseDirty: boolean;
	dialog: "none" | "unsaved" | "conflict";
}
```

Owns:

- pending close/switch intent
- dialog visibility
- pane-local UI workflow state
- protection against stale async work after preview reuse

## Command Surface

All editor transitions should go through one coordinator API:

- `requestPaneClose(paneId)`
- `requestTabClose(tabId)`
- `requestPreviewReplacement(paneId, nextFile)`
- `requestViewModeChange(paneId, nextMode)`
- `saveSession(paneId, { force?: boolean })`
- `discardSession(paneId)`

`removePane` and `removeTab` stay as low-level destructive operations and should only run from the coordinator after workflow checks pass.

## Behavior Rules

- If the target document is clean, execute the intent immediately.
- If the target document is dirty, store `pendingIntent` on the session and show the unsaved-changes dialog.
- If save hits a revision conflict, move the document to `conflict` and show the conflict UI.
- If save or discard succeeds, resume `pendingIntent`.
- Dirty preview panes may still auto-pin, but pinning is a convenience, not the safety boundary.

## UI Ownership

- `FileViewerPane` becomes a binder over document state, session state, and editor adapters.
- Dialog visibility comes from session state, not local component state.
- Tab close can aggregate dirty documents into one confirmation flow.
- Multiple panes can point at one document without duplicating save/conflict state.

## Required Decisions

- `documentKey`
  - Use logical file identity, not pane identity.
  - Recommend: `workspaceId + filePath + diff identity`.
  - `raw` and `rendered` should share one editable document.
- Editable vs read-only documents
  - Images, binary files, too-large files, remote URLs, and non-editable diff views should register as read-only and bypass dirty/save flows.
- Current text ownership
  - `editorBufferRegistry` is the source of truth for live draft text.
  - Global stores keep metadata only.
- Multi-pane behavior
  - Multiple panes on the same document share one draft, dirty state, conflict state, and external-change state.
- Lifecycle
  - Pane mount creates or binds a session.
  - Preview replacement rebinds the session and increments `generation`.
  - Last-session cleanup drops document metadata and buffers unless draft recovery is added later.
- Rename behavior
  - Rename/retarget should preserve the existing document/session instead of creating a new draft context.
- Stale async protection
  - Loads, saves, and file watcher events must be ignored when `documentKey` or `generation` no longer matches.
- Close/switch entry points
  - Toolbar close, context menu close, Mosaic close, tab close, preview replacement, and mode switch must all route through the coordinator.
- Dirty detection
  - Keep current V1 semantics: dirty is exact string inequality against baseline content.
  - Baseline updates only on clean load, successful save, discard, or reload from disk.

## Validation

Manual checks:

1. Edit a file and switch view mode.
2. Edit a file and close the pane from the toolbar.
3. Edit a file and close the pane through Mosaic.
4. Edit a file and close its tab.
5. Edit a preview pane, then open another file.
6. Trigger a save conflict and confirm the conflict flow still works.
7. Change the file on disk while dirty and confirm external-change behavior still works.
8. Open the same file in two panes and confirm draft/dirty state stays consistent.
9. Rename a dirty file and confirm the editor state follows the file.

## Migration

1. Add `useEditorDocumentsStore`, `useEditorSessionsStore`, and `editorBufferRegistry` with no behavior changes.
2. Move the current mode-switch unsaved flow into the coordinator.
3. Route pane close, Mosaic close, and preview replacement through coordinator commands.
4. Route tab close through `requestTabClose`.
5. Add app-quit handling later if needed.

## Non-Goals

- Persisting unsaved draft text in app state
- Replacing Zustand
- Reworking editor rendering or query ownership
- Undo/redo redesign
- Cross-window or collaborative editing
