# Code Editor Migration Plan

## Overview

This document outlines a staged migration away from Monaco in the desktop app.

The target architecture is:

- **Raw file editing:** CodeMirror 6
- **Diff experience:** `diffs.com`
- **Rollout strategy:** direct migration, incremental, measurable

This is intentionally not a big-bang rewrite. The main risk is not rendering text; it is preserving current editor behavior while reducing startup cost, memory usage, and typing latency.

## Why Migrate

Monaco is currently integrated deeply enough that it affects more than just file editing:

- It is mounted at the desktop app root via `apps/desktop/src/renderer/routes/-layout.tsx`
- It is initialized through `apps/desktop/src/renderer/providers/MonacoProvider/MonacoProvider.tsx`
- It powers both raw editing and diff rendering

Even with diagnostics disabled, Monaco still carries bundle, worker, and runtime overhead that is hard to justify if the product mostly needs a fast embedded editor rather than a full VS Code-style IDE surface.

## Current Monaco Touchpoints

The main replacement scope is concentrated in these files:

- `apps/desktop/src/renderer/providers/MonacoProvider/MonacoProvider.tsx`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/components/FileViewerContent/FileViewerContent.tsx`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ChangesContent/components/DiffViewer/DiffViewer.tsx`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/FileViewerPane.tsx`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/hooks/useFileSave/useFileSave.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/EditorContextMenu/useEditorActions.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/components/EditorContextMenu/editor-actions.ts`

## Goals

1. Stop paying Monaco initialization cost for users who are not actively editing files.
2. Replace the raw editor with a lighter, more modular editor.
3. Decouple editor-dependent behaviors from Monaco-specific APIs.
4. Move diff rendering to `diffs.com` instead of rebuilding Monaco diff behavior locally.
5. Compare performance as the migration lands and remove Monaco once parity is confirmed.

## Non-Goals

- Recreating every Monaco capability
- Adding IDE-grade language services
- Rewriting file loading or save mutations
- Migrating unrelated markdown or image rendering flows

## Target Architecture

### Raw Editor

Use CodeMirror 6 for:

- opening and editing text files
- read-only file viewing
- selection and cursor management
- save shortcuts
- basic find flow
- copy path with line numbers
- theme integration

### Diff

Use `diffs.com` for:

- diff visualization
- diff navigation
- editable or review-oriented diff workflows, depending on the integration mode chosen

This removes the need to port Monaco's diff-specific logic directly.

### Adapter Layer

Introduce an internal editor adapter so the rest of the file pane does not depend on Monaco or CodeMirror directly.

Proposed adapter surface:

```ts
interface CodeEditorAdapter {
  focus(): void;
  getValue(): string;
  setValue(value: string): void;
  revealPosition(line: number, column?: number): void;
  getSelectionLines(): { startLine: number; endLine: number } | null;
  selectAll(): void;
  cut(): void;
  copy(): void;
  paste(): void;
  openFind(): void;
  dispose(): void;
}
```

The goal is not to abstract every editor feature. The goal is to cover the exact behaviors already used by the file pane and context menu.

## Migration Phases

### Phase 0: Measure Before Changing Behavior

Establish a baseline for:

- desktop app startup time
- time to first file open
- memory after app launch
- memory after opening a large file
- typing latency in the raw editor

Capture each metric with a fixed harness so the rollout gate is objective:

- run the same production desktop build on the same machine against the same representative repo snapshot
- take 5 cold runs for startup and first-file-open timings, and record both p50 and p95
- measure memory as renderer RSS 30 seconds after launch and again 30 seconds after opening a representative large text file
- measure typing latency as input-to-paint p50/p95 while editing that same large text file
- record the results in the PR description or linked rollout issue before deleting Monaco

Also run a quick experiment that lazy-loads Monaco instead of mounting it globally. This tells us how much of the pain is caused by Monaco itself versus eager initialization.

Suggested rollout thresholds:

- startup p95 must not regress against the lazy-loaded Monaco control
- first-file-open p95 must not regress against the current Monaco path
- memory after launch must improve by at least 20%
- memory after opening a large file must improve by at least 20%
- typing-latency p95 must not regress

### Phase 1: Decouple File Pane Logic from Monaco

Create an editor-agnostic layer and migrate current consumers to it.

Work items:

- Replace `Monaco.editor.IStandaloneCodeEditor` refs in `FileViewerPane.tsx`
- Update `useFileSave.ts` to depend on adapter methods like `getValue()` instead of Monaco types
- Update `useEditorActions.ts` to call adapter methods instead of `editor.trigger(...)`
- Move save shortcut registration out of Monaco-specific utilities
- Move copy-path-with-line behavior out of Monaco action registration

Exit criteria:

- file save flow is editor-agnostic
- context menu is editor-agnostic
- file pane state no longer imports Monaco types directly outside the Monaco wrapper

### Phase 2: Migrate Raw File Editing to CodeMirror 6

Build a `CodeEditor` wrapper component backed by CodeMirror 6 and use it in the raw editor path.

Required parity:

- load file content
- update dirty state on edit
- save on `Cmd/Ctrl+S`
- read-only mode
- line/column jump from file viewer state
- copy path with current line or selection range
- basic find support
- theme application using existing Superset theme tokens

Explicitly defer anything not used today.

Suggested implementation shape:

- `renderer/components/CodeEditor/CodeEditor.tsx`
- `renderer/components/CodeEditor/index.ts`
- `renderer/components/CodeEditor/lib/` for adapter and keymaps

Exit criteria:

- raw file editing no longer depends on `@monaco-editor/react`
- save and unsaved-change behavior matches current behavior

### Phase 3: Replace Diff Viewer with `diffs.com`

Do not port the current Monaco diff viewer one-to-one unless needed. Treat diff as a separate product surface.

Work items:

- define the integration contract for `diffs.com`
- map current inputs to the new diff viewer
  - original content
  - modified content
  - file path
  - editable state
- preserve save flow for editable diffs if supported by the chosen integration path
- preserve pane-level actions around closing, splitting, and navigation

Behavior that may change:

- first-diff auto-scroll
- hidden unchanged region behavior
- exact keyboard shortcuts
- exact selection semantics between original and modified panes

These should be treated as explicit product decisions, not accidental regressions.

Exit criteria:

- diff view no longer renders Monaco
- editable diff save flow still works, or the product intentionally scopes editable diff differently
- users can review file changes without loading Monaco

### Phase 4: Remove Monaco from the Root Layout

Once both the raw editor and diff no longer depend on Monaco:

- stop mounting `MonacoProvider` at the app root
- remove global worker setup from normal startup
This is where the startup win should become most visible.

### Phase 5: Rollout, Compare, and Delete

Roll out to internal users first.

Compare:

- startup time
- memory usage
- CPU during file open
- typing responsiveness
- crash rate or renderer instability

Use the same capture method and thresholds from Phase 0 for the rollout decision. "Measurably faster or lighter" means those thresholds are met in the same test environment.

If the CodeMirror + `diffs.com` path is stable and better, remove:

- `@monaco-editor/react`
- `monaco-editor`
- `MonacoProvider`
- Monaco-only editor action utilities

## Acceptance Criteria

The migration is complete when:

1. Opening the desktop app no longer initializes Monaco by default.
2. Raw text editing works through CodeMirror 6.
3. Dirty-state tracking and save flows still behave correctly.
4. Copy path, copy path with line, select all, cut, copy, paste, and find still work in the file pane.
5. Diff rendering is handled by `diffs.com`.
6. The new path meets the rollout thresholds defined in Phase 0.
7. Monaco can be removed without losing required user-facing capabilities.

## Risks

### Diff Product Fit

`diffs.com` may not map exactly to Monaco's current editable diff behavior. This is the largest product and integration risk.

Mitigation:

- treat diff as a separate migration track
- define required behaviors early
- explicitly decide which Monaco diff behaviors matter and which do not

### Context Menu and Shortcut Parity

Current editor actions use Monaco-specific command IDs and selection models.

Mitigation:

- move all command logic behind the adapter
- write small parity tests around selection and save shortcuts

### Theme Parity

Monaco theming is currently specialized.

Mitigation:

- map Superset theme tokens to a shared editor theme contract
- avoid embedding Monaco-specific theme types into the broader renderer state

### Rollout Complexity

Landing the migration directly raises the risk of broad regressions if too many behaviors move at once.

Mitigation:

- keep the adapter small
- migrate raw editing and diff rendering in clearly separated commits
- delete Monaco quickly after validation

## Recommended Sequence

### Week 1

- baseline performance measurements
- lazy-load Monaco experiment
- define editor adapter
- remove Monaco types from save and context menu flows

### Week 2

- implement CodeMirror 6 raw editor
- internal QA on raw editing flows

### Week 3

- integrate `diffs.com`
- validate diff review workflows
- resolve save-path decisions for editable diffs

### Week 4

- remove Monaco from root startup path
- compare metrics
- clean up fallback code if results hold

## Implementation Checklist

- [ ] Measure current Monaco startup and editor-open costs
- [ ] Test lazy-loaded Monaco as a control
- [ ] Add editor adapter interface
- [ ] Refactor `useFileSave.ts` to consume adapter methods
- [ ] Refactor `useEditorActions.ts` to consume adapter methods
- [ ] Ensure adapter owners call `dispose()` when tearing down editor instances
- [ ] Replace Monaco copy-path action registration
- [ ] Implement CodeMirror 6 raw editor wrapper
- [ ] Migrate raw editor path in `FileViewerContent.tsx`
- [ ] Integrate `diffs.com` for diff rendering
- [ ] Validate editable diff save flow
- [ ] Remove `MonacoProvider` from root layout
- [ ] Compare before/after metrics
- [ ] Remove Monaco dependencies and dead code

## Open Questions

1. Does `diffs.com` need to support in-place editable diffs, or is read/review-only acceptable initially?
2. Should find be implemented with native CodeMirror search UI, or should it continue to route through Superset-owned UI controls?
3. Do we want Monaco kept as a hidden fallback for one release, or removed immediately after internal validation?
