# v2 pane persistence across workspace switch

## Context

Switching v2 workspaces unmounts the entire `<WorkspaceTrpcProvider>` subtree
(`layout.tsx:79` uses `key={`${workspace.id}:${hostUrl}`}`). Every pane React
component for the outgoing workspace is torn down and recreated for the
incoming one. Load-bearing long-lived state (xterm instance + WebSocket,
webview guest process, CodeMirror `EditorView`) must live OUTSIDE the
remounting subtree to survive. This note captures the root cause for each
pane kind and the fix pattern so we don't have to re-derive it.

## Shared root cause

The `key` on `WorkspaceTrpcProvider` is load-bearing — it exists
(commit `57557f806`) to prevent crashes from hook calls bleeding across
trpc clients during transitions. We cannot remove it. Any pane that wants
to survive workspace switches must:

1. Hold its long-lived state in a module-level registry singleton.
2. Own a DOM node (or native handle) parented *outside* the React
   workspace subtree (body-level `<div>` is the simplest).
3. Let the React component be a thin placeholder that only drives
   position/visibility of the registry-owned node.

Think "VSCode `TerminalInstance` + `setVisible`" or the existing
`browserRuntimeRegistry` root-container pattern.

## Terminal — fixed in PR #3687

Was broken: `registry.attach()` fused DOM attach with WebSocket open and was
gated on `ensureSession`. The wrapper was `wrapper.remove()`'d on every
React unmount, so workspace switch was visible detach + reattach. The
`ensureSession` gate also added tRPC latency on warm returns, and opened
the WS against a nonexistent session on cold mount → "Session not found".

Fixed by:
- Park wrapper in a hidden body-level `#v2-terminal-parking` div on
  detach instead of `.remove()`.
- Split `attach` into `mount` (sync DOM) and `connect` (called only after
  `ensureSession` resolves).
- Narrow `TerminalPane` effect deps to `[terminalId]`; read `workspaceId`
  and `websocketUrl` through refs. `websocketUrl` changes go through a
  separate `registry.reconnect` that no-ops on a cold transport.

Refs: `terminal-runtime.ts`, `terminal-runtime-registry.ts`,
`TerminalPane.tsx`.

## Browser — fixed

### Symptom

Switching workspaces destroyed the browser webview (and the guest page
along with it) instead of preserving state across the switch.

### Root cause

Confirmed via instrumentation: `browserRuntimeRegistry.destroy` was
being called on workspace switch with a stack rooted in React commit.
The only caller was `usePaneRegistry.tsx`'s `onRemoved` wiring:

```ts
onRemoved: (pane) => browserRuntimeRegistry.destroy(pane.id),
```

`onRemoved` comes from `packages/panes/.../Workspace.tsx`, which diffs
`previousPanesRef` against `current` in a `useEffect` and calls
`registry[kind].onRemoved` for any id that disappeared. The diff lives
inside a single Workspace component instance. Under ideal conditions —
the v2 layout's `key={`${workspace.id}:${hostUrl}`}` remounts on every
switch — this diff should never observe cross-workspace "removal"
because each workspace has its own Workspace component.

But the remount isn't always prompt: layout.tsx's `useLiveQuery` can
return stale WS-A data for a tick while `page.tsx`'s query has already
flipped to WS-B. During that tick the `key` hasn't changed yet, so the
existing `WorkspaceContent` stays mounted, `useV2WorkspacePaneLayout`
calls `store.replaceState(WS-B panes)` on the *same* store instance,
and the Panes library's diff correctly observes "the browser pane from
WS-A is gone now" → fires `onRemoved` → destroys the webview. By the
time the user returns to WS-A, the entry is gone; `attach()` runs the
`createEntry()` cold path and the webview is recreated with its
`initialUrl`, losing state.

The terminal never hit this because terminal destruction goes through
`useGlobalTerminalLifecycle`, which sweeps against *all* workspaces'
persisted `paneLayout` rows and only destroys ids that are provably
absent everywhere. Cross-workspace "removal" isn't a real removal from
that sweep's perspective.

### Fix

Mirrored the terminal pattern: added `useGlobalBrowserLifecycle` under
`_authenticated/components/GlobalBrowserLifecycle/`, mounted it next to
`<GlobalTerminalLifecycle />` in `_authenticated/layout.tsx`, and
removed the `onRemoved` wiring from `usePaneRegistry.tsx`. The new hook
extracts browser `pane.id`s from every workspace's `paneLayout`, diffs
against the previous set, and schedules `browserRuntimeRegistry.destroy`
on a 500 ms grace delay (same timing as the terminal sweep) so
cross-workspace pane moves don't trigger premature teardown.

Hypothesis #1 (placeholder-rect race) and #3 (webview recycling on
`visibility: hidden`) from the original list did not reproduce once #2
was fixed — the instrumentation showed `updateLayout` applying correct
non-zero rects and the webview surviving detach as long as no `destroy`
call fired. Left in place as known-good; will revisit if a future
regression points at either.

## File / Code editor — lower priority

File-viewer panes use CodeMirror `EditorView` created in a `useEffect([])`
inside `CodeEditor.tsx:153-171`, disposed on unmount. Workspace switch
therefore loses: undo history, cursor position, scroll position, any
unsaved viewport scroll. Not reported yet but predictable; users may
complain after terminal/browser are solid.

Fix pattern is identical: a module-level `codeEditorRegistry` keyed by
`${workspaceId}:${filePath}` (or pane id, if file viewer panes are
per-workspace) that owns the `EditorView` and its host div, with a body-
level root container. `CodeEditor` becomes a placeholder that registers
a rect.

Defer until it's a reported problem — the migration is mechanical but
the value is speculative and CodeMirror re-init is already fast.

## Not in scope

- v1 terminal. Sunset per CLAUDE.md / memory.
- v2 chat pane. Currently a "temporarily disabled" stub.
- Diff / comment / devtools. No long-lived state.
