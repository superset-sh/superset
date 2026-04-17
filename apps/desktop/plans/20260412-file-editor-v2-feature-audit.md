# File Editor v2 — Feature Audit & Rebuild Checklist

## How to use this doc

Living checklist for porting v1's file-editor feature set into v2 and rebuilding it to be better along the way. Each item is tagged:

- `[x]` already working in v2 — verify by opening the cited v2 path
- `[ ]` not yet in v2 — open the cited v1 path as a reference when porting
- `[~]` partial in v2 (stubbed, TODO'd in code, or shared with v1) — needs finishing or cleanup
- 💡 intentional improvement over v1 (v1 does not have this)

Mark items off as we ship them. Keep v1 code untouched per the V1→V2 duplicate rule — all work lands under `v2-workspace/$workspaceId/`.

## Where things live

**v1 editor:** `apps/desktop/src/renderer/screens/main/components/WorkspaceView/components/ContentView/TabsContent/TabView/FileViewerPane/`. CodeMirror 6 surface (`.../WorkspaceView/components/CodeEditor/CodeEditor.tsx`) plus a coordinator layer (`WorkspaceView/state/editorCoordinator.ts`, `editorBufferRegistry.ts`, `useEditorDocumentsStore`, `useEditorSessionsStore`) handling buffers, dirty state, revisions, conflicts, and session-to-pane binding.

**v2 editor:** `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/`. `FilePane.tsx` routes to `renderers/CodeRenderer`, `renderers/MarkdownRenderer`, or `renderers/ImageRenderer`. Read/write goes through `renderer/hooks/host-service/useFileDocument`. Pane state lives in the v2 pane registry + Zustand workspace store, not v1's editor coordinator.

**Architectural flag:** `CodeRenderer.tsx:2` and `MarkdownRenderer.tsx:3` import `CodeEditor` directly from the v1 path. Decoupling this is item 13.1 below.

---

## 0. Core architecture: file-type registry

The rebuild centers on a small registry rather than the hardcoded `if (isImage) ... else if (isMarkdown) ...` branching that `FilePane.tsx` currently does. This section documents the shape we're building toward — everything below is evaluated against it.

### Shape

```ts
type FileHandler = {
  id: string;                    // "markdown" | "image" | "csv" | "code"
  match: (filePath: string, meta: FileMeta) => boolean;
  documentKind: "text" | "bytes" | "custom";
  views: FileView[];             // ordered by priority; default is views[0]
  defaultViewId?: string;
};

type FileView = {
  id: string;                    // "code" | "preview" | "grid"
  label: string;                 // "Markdown" | "Preview" | "Grid"
  Renderer: ComponentType<ViewProps>;
  search?: SearchAdapterFactory; // per-view search implementation
};
```

### Rules

1. **One pane, swap renderer.** All views on a handler render inside the *same* `FilePane` container. Toggling a view swaps the React component; it does **not** open a new tab or pane. This matches Cursor's behavior (one tab, header toggle, shared scroll position).
2. **Shared document across views.** Every view on a given URI subscribes to one reference-counted `useFileDocument` handle. Dirty state, revision, external-change detection, and save flow are shared — swapping views or opening the same file in a split keeps edits in sync.
3. **Hide the toggle when there's only one view.** If `handler.views.length === 1`, the pane header shows no mode-toggle UI at all. This is one of our three design decisions (see below).
4. **Search is per-view.** Each view registers its own `SearchAdapterFactory`. The find widget UI is shared (Cursor-style, see section 5); the matching implementation is delegated to whichever view is active.
5. **`documentKind: "custom"` is the escape hatch.** Views that need their own state model (future: Jupyter notebooks, SQLite explorer, hex editor) opt out of the shared-text-document machinery and manage their own document. 90% of file types go through `"text"`.

### Three concrete design decisions

1. **Markdown defaults to `code` view, not `preview`.** `MarkdownRenderer.tsx:23` currently hardcodes `"rendered"`; flip the default and make `"preview"` the secondary option. Label the code view "Markdown" (matching Cursor) rather than "Raw".
2. **Mode toggle only renders when `views.length > 1`.** Code-only file types get no header chrome clutter. Markdown gets a toggle. Future CSV/JSON-form get toggles.
3. **Cursor-style find widget + per-view search adapters.** One shared find component at the top of the pane (case-sensitive, whole-word, regex, match-count, up/down nav, close). The adapter interface (`open`, `setQuery`, `next`, `previous`, `close`, flags) is implemented per-view: CodeMirror uses its native search state; TipTap preview does DOM-range search; grid view (future) highlights matching cells.

### Initial handlers

| Handler | `match` | `documentKind` | Views | Toggle? |
|---|---|---|---|---|
| `image` | `isImageFile` | `"bytes"` | `image` | no |
| `markdown` | `isMarkdownFile` | `"text"` | `code` (default, "Markdown"), `preview` ("Preview") | yes |
| `binary` | content probe | `"bytes"` | `warning-then-code` | no |
| `code` | fallback | `"text"` | `code` | no |

### Future handlers (design must scale to these)

| Handler | Why it fits | Notes |
|---|---|---|
| `csv` / `tsv` | `documentKind: "text"`; `grid` (default) + `source` views share the same text buffer | Grid virtualizes rows; source is CodeMirror with CSV highlighting. Large-file fallback reuses the `too-large` view on the `code` handler. |
| `json-form` | `documentKind: "text"`; `form` + `source` views | Specific filename matchers for `package.json`, `tsconfig.json`, etc. can layer structured forms over raw JSON. |
| `env` | `documentKind: "text"`; `form` + `source` views | Key/value form UI for `.env` files. |
| `notebook` / `.ipynb` | `documentKind: "custom"` | Cell-based model, not a flat string. Owns its own state and save path. |
| `sqlite` | `documentKind: "custom"` | Query UI, schema explorer, result grid. |
| `pdf` | `documentKind: "bytes"` | Read-only viewer. |
| `hex` | `documentKind: "custom"` | Cross-file alternative view for binary content. |

### Grounded in VS Code's editor architecture

VS Code (verified against `/tmp/vscode-research/vscode/src/vs/workbench/services/editor/common/editorResolverService.ts`) uses `IEditorResolverService.registerEditor(glob, info, options, factory)` with priority levels `builtin | option | default | exclusive` (`RegisteredEditorPriority` at lines 64–69). Each registration produces a separate `EditorInput` that opens in its own pane — i.e., VS Code does **not** have an in-pane mode toggle. Cursor layered a header affordance on top that swaps renderers inside one pane while keeping the same underlying text model.

We're taking two concrete things from VS Code:
- **Reference-counted shared text model.** VS Code's `textModelResolverService.createModelReference(resource)` (`customTextEditorModel.ts:30`) hands out refcounted references to a singleton `ITextModel` per URI. That's how source + preview stay in sync. Our equivalent: `useFileDocument` becomes keyed by absolute path with a refcount, so two views or a split share one buffer.
- **User override setting.** VS Code's `workbench.editorAssociations` setting (`editorResolverService.ts:37`) is a glob → default-view map. Our equivalent is a setting that lets a user say "always open `.md` in Preview" without changing the handler's default.

We're **not** taking:
- VS Code's pane-per-EditorInput model. Views are renderer components inside one pane, not separate panes.
- `Reopen Editor With…` as a launch feature. Nice to have later for switching handlers entirely (e.g., `.json` → form editor); not needed for launch.

---

## 1. Editor surface (CodeMirror)

- [~] CodeMirror 6 with line numbers, history, bracket matching, multi-cursor, indent-on-input, line wrapping, drop cursor, selection-match highlight — *currently the v1 `CodeEditor.tsx` is imported into v2; duplicate it into v2*
- [x] Syntax highlighting (~25 languages via `loadLanguageSupport.ts`)
- [x] Cmd+S save keymap
- [x] Theme + font reactivity (`createCodeMirrorTheme`, `useResolvedTheme`)
- [ ] Word wrap toggle 💡 (v1 always-on)
- [ ] Tab width / indent size setting 💡
- [ ] Read-only compartment for non-editable contexts (v1: `editableCompartment`)

## 2. Save / dirty state / conflicts

- [x] Save via `useFileDocument` → `filesystem.writeFile` with `ifMatch` revision precondition
- [x] Dirty dot in tab title — `usePaneRegistry.tsx:131`
- [x] External disk change detection via `fs:events` subscription (auto-reload when clean)
- [~] **Save conflict resolution dialog** — v1 ships `FileSaveConflictDialog` (Reload / Review Diff / Overwrite). v2 `useFileDocument` populates `conflict.diskContent` but `FilePane` never renders it. Port required.
  - v1: `.../FileViewerPane/components/FileSaveConflictDialog/`
- [~] **Close-pane save guard** — `usePaneRegistry.tsx:154` "Save" button is a `// TODO: wire up save via editor ref` no-op. Needs a document handle.
- [ ] Discard / revert a dirty buffer (no hotkey, no menu in v2)
- [ ] Multi-file sequenced save when a tab with multiple dirty panes closes
  - v1: `editorCoordinator.saveAndClosePendingTab`
- [ ] Document buffer registry equivalent so a file open in two panes shares state
  - v1: `WorkspaceView/state/editorBufferRegistry.ts`
- [ ] External rename tracking — panes update their path and preserve dirty state
  - v1: `FileViewerPane.pendingRenamePathRef`

## 3. View modes (via the file-type registry — see section 0)

Diff is **not** a view on the `code` or `markdown` handlers in v2 — it stays as its own pane kind (`DiffPane`, already in v2). This is a simplification over v1's three-way `raw | rendered | diff` toggle.

- [ ] Build the `FileHandler` / `FileView` registry described in section 0
- [ ] `FilePane.tsx` dispatches via the registry instead of hardcoded `isMarkdownFile`/`isImageFile` branches
- [ ] Pane header renders a segmented toggle only when `handler.views.length > 1`
- [~] Markdown handler registers `code` (default) + `preview` views
  - Fix `MarkdownRenderer.tsx:23` — flip default from `"rendered"` to `"code"`, wire up `_setViewMode`, mount `MarkdownViewModeToggle` via the shared header toggle (not `renderHeaderExtras`)
- [ ] Code handler registers a single `code` view; no toggle shown
- [ ] Image handler registers a single `image` view; no toggle shown
- [ ] Binary handler registers a `warning-then-code` view that prompts before opening as text
- [ ] Mode-switch preserves the shared document — no remount, no dirty-state loss (v1: `requestViewModeChange` in `editorCoordinator`)
- [ ] User setting: per-glob default view override (VS Code's `workbench.editorAssociations` equivalent) 💡

## 4. Diff view (per-file)

- [ ] Inline vs side-by-side toggle (v2 has this on the changes pane, not per-file)
- [ ] Hide unchanged regions toggle
- [ ] Auto-scroll to first changed line on diff open
  - v1: `useScrollToFirstDiffChange`
- [ ] Diff scrollbar decorations
  - v1: `DiffScrollbarDecorations` component
- [ ] Right-click "Edit at location" (see 3)

## 5. Find / search

Cursor-style: one shared find widget at the top of the pane with case-sensitive, whole-word, regex, match-count, up/down nav, close. Each view registers a `SearchAdapterFactory` (see section 0). Find UI is shared; matching logic is delegated.

- [ ] Shared find widget component (`FilePaneFindBar`) rendered at the top of `FilePane` when search is open — case-sensitive, whole-word, regex toggles, match count, prev/next, close
- [ ] `SearchAdapter` interface: `open()`, `setQuery(q, flags)`, `next()`, `previous()`, `close()`, `matchCount`, `activeIndex`
- [ ] Thread `editorRef` through `CodeRenderer` so the `code` view's search adapter can call `openSearchPanel(view)` (currently broken — `editorRef` is not passed)
- [ ] `code` view adapter wraps CodeMirror's native search state
- [ ] `preview` view adapter does DOM-range text search over the TipTap container
  - v1 reference: `MarkdownSearch` + `useMarkdownSearch`
- [ ] Diff pane adapter — lives on `DiffPane`, not the file-type registry
  - v1 reference: `useDiffSearch`
- [x] CodeMirror's default Cmd+F keymap still works inside the code view (fallback)
- [ ] 💡 Project-wide find-in-files (v1 missing too)

## 6. Tab / preview pane UX

- [x] Preview pane (italic title when unpinned) — `usePaneRegistry.tsx:128`
- [x] Pin on header click — `onHeaderClick: ctx.actions.pin()`
- [ ] **Auto-pin on first edit** (v1: `pinPane` triggered by `dirty && !isPinned` in `FileViewerPane`)
- [ ] File-open-mode setting (preview vs always-new-tab)
  - v1: `useFileOpenMode`, `settings.getFileOpenMode`
- [ ] Reopen-closed-tab hotkey (Cmd+Shift+R)
  - v1: `REOPEN_TAB` in the hotkey registry
- [ ] Move pane to tab / move pane to new tab

## 7. Split panes (within a tab)

- [ ] Split horizontal / vertical / auto from file-pane toolbar
- [ ] Split with new chat / split with new browser
- [ ] Equalize splits
- [ ] Prev/Next pane keyboard nav (`Cmd+Shift+Left/Right` in v1)

## 8. Context menu

- [~] v2 only relabels "Close Pane" → "Close File" at `usePaneRegistry.tsx:172`. Needs:
- [ ] Cut / Copy / Paste
- [ ] Copy Path
- [ ] Copy Path:Line (with selection range — v1: `useEditorActions.handleCopyPathWithLine`)
- [ ] Find
- [ ] Reveal in Files sidebar
- [ ] Open in External Editor (tRPC: `external.openFileInEditor`)
- [ ] Pane actions (split, move-to-tab, close)

## 9. File pane toolbar / header

- [ ] Filename / breadcrumb in pane body (v2 only shows filename in tab title)
- [ ] Pin / unpin button (v1: `FileViewerToolbar`)
- [ ] Mode toggle (segmented control) — shown only when the current handler has >1 view (see section 0)
- [ ] Save indicator + manual save button
- [ ] Diff sub-controls (inline/side-by-side, hide unchanged) — these live on `DiffPane`, not on the file-type registry

## 10. Image / binary / special files

- [x] Image viewer (`ImageRenderer.tsx`) up to 10 MB, base64
- [x] Too-large / not-found / binary placeholders (`FilePane.tsx:55-82`)
- [ ] 💡 Zoom / pan / fit / actual-size controls
- [ ] 💡 Copy image to clipboard

## 11. Settings affecting the editor

- [x] Editor font family + size (`settings.getFontSettings`)
- [x] Theme (light/dark/system)
- [ ] File open mode (preview vs new tab)
- [ ] Markdown style preference passthrough
- [ ] 💡 Word wrap, tab width, render whitespace

## 12. Hotkeys

- [x] Cmd+S save
- [ ] Cmd+F find (wired in CodeMirror, but no surfaced button/action)
- [ ] Cmd+Shift+C copy-path-with-line
- [ ] Cmd+Shift+W close-tab with dirty guard
- [ ] Cmd+Shift+R reopen-closed-tab
- [ ] Prev/next tab, prev/next pane
- [ ] User-overridable hotkey table in settings (v1: `hotkeyOverridesStore`)

## 13. v2-specific architectural cleanup

- [ ] **13.1** Duplicate `CodeEditor.tsx` (and its `createCodeMirrorTheme`, `loadLanguageSupport.ts`, adapter) from v1 into `v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/components/CodeEditor/`. Update imports in `CodeRenderer.tsx` and `MarkdownRenderer.tsx`. Per `feedback_v1_v2_port_duplicate.md`: duplicate, do not share or delete v1.
- [ ] **13.2** Same treatment for `TipTapMarkdownRenderer` and any other v1 editor utilities pulled in by v2.
- [ ] **13.3** Build the `FileHandler` / `FileView` registry described in section 0. Ship with `code`, `markdown`, `image`, `binary` handlers. `FilePane.tsx` dispatches through the registry instead of hardcoded type branches.
- [ ] **13.4** Make `useFileDocument` reference-counted and keyed by absolute path, so multiple views on the same file (or a split) share one buffer. This is our equivalent of VS Code's `textModelResolverService.createModelReference`.
- [ ] **13.5** Build a v2-native equivalent of `editorCoordinator` / `editorBufferRegistry` / session store, scoped to the v2 pane registry, so multi-pane shared buffers, conflict resolution, rename tracking, and close-tab save sequencing all have a consistent home. Decide whether it layers on top of `useFileDocument` or folds buffer ownership in.
- [ ] **13.6** Thread `editorRef` (the `CodeEditorAdapter`) through `CodeRenderer` so the pane can call `openFind()`, `revealPosition()`, etc. from outside the editor — blocks find widget, close-pane save guard, go-to-line, and copy-path-with-line.

## 14. Rebuild improvements (do better than v1)

- 💡 Go-to-line command (Cmd+G)
- 💡 **Link detection / Cmd+click navigation** — cheapest LSP-adjacent feature. Parse the visible buffer for path-like strings (imports, markdown links, `file.ts:123:4` log patterns), underline on hover, Cmd+click to open via `openFilePane`. One CodeMirror decoration extension + a path-resolver utility. Should be structured as a built-in `LinkProvider` (see section 15) so future LSP providers plug into the same registry. Ship as the next PR after v2 launches.
- 💡 Inline AI edits / ghost text driven by the workspace chat session — v1 has zero editor ↔ AI integration
- 💡 Sticky scroll (current function header pinned to the top of the viewport) — CodeMirror community extensions exist
- 💡 Breadcrumb path in pane body, click segments to navigate

---

## 15. LSP roadmap (post-launch, not on the implementation spec)

Language features (diagnostics, hover, go-to-definition, completion, rename) are **explicitly out of scope for v2 launch**. This section documents the tiered path for adding them later so we can reason about it without committing.

VS Code's architecture (verified at `editor/contrib/links/browser/links.ts:42` and `editor/common/languages.ts:1551`) is a unified `LanguageFeatureRegistry<T>` pattern shared across `LinkProvider`, `DefinitionProvider`, `HoverProvider`, `CompletionProvider`, etc. Each file type / language ID can register N providers from N sources. If we build LSP, we mirror this registry pattern.

### Tier 1 — Link detection (≈1 day)

Parse the buffer for link-like patterns. Zero language-server involvement. Covers ~70% of "go to related file" use cases.

- Path strings in import statements (`import X from "./foo"`, `from .foo import X`, etc.)
- Markdown links (`[text](./other.md)`)
- Log-line references (`foo.ts:123:4`)
- Bare path strings in any language (`"./config.json"`)

Implementation: one CodeMirror decoration extension that underlines matches on hover; Cmd+click resolves against the file's directory and opens via `openFilePane`. Register as a built-in `LinkProvider` in whatever feature-registry shape we pick, so tier 3 can add more providers without refactoring tier 1.

### Tier 2 — Inline diagnostics without a server (≈3–5 days)

- Run `tsc --noEmit` / `eslint` / language-specific linters as subprocesses per save
- Parse output into diagnostics, feed into CodeMirror's `@codemirror/lint` extension
- Red squigglies + gutter markers + popover error details

No protocol work. No hover docs, no completion, no go-to-definition — just diagnostics. Priority depends on user feedback after launch.

### Tier 3 — Full LSP (≈2–4 weeks, own design doc required)

- Per-workspace language-server process manager (spawns tsserver, pyright, rust-analyzer, etc. on file-type open)
- CodeMirror LSP bridge (community clients: `codemirror-languageserver`, `@open-rpc/codemirror-lsp-client`)
- Hover tooltips, completion popups, go-to-definition (peek overlay or pane navigation), find references, rename symbol
- Config for which server handles which extension
- `LanguageFeatureRegistry<T>` shared across all feature types so tier 1's link provider coexists with LSP-contributed providers

Should be its own design doc with its own plan — not appended to this audit. Flagged here only so we don't accidentally design tier-1 in a way that blocks tier-3.

### What we should NOT do

- Don't try to ship tier 2 or 3 with v2 launch
- Don't build a custom LSP protocol layer (CodeMirror clients exist)
- Don't try to match VS Code's language feature completeness — pick the features that matter most for our users (likely: TypeScript + Python diagnostics, go-to-definition across files)

---

## Key file paths

**v1 reference:**
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/components/ContentView/TabsContent/TabView/FileViewerPane/FileViewerPane.tsx`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/components/CodeEditor/CodeEditor.tsx`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/state/editorCoordinator.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/state/editorBufferRegistry.ts`
- `.../FileViewerPane/components/FileSaveConflictDialog/`
- `.../FileViewerPane/hooks/{useFileSave,useFileContent,useDiffSearch,useMarkdownSearch}.ts`

**v2 target:**
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`
- `.../usePaneRegistry/components/FilePane/FilePane.tsx`
- `.../FilePane/renderers/{CodeRenderer,MarkdownRenderer,ImageRenderer}/`
- `.../FilePane/components/ExternalChangeBar/ExternalChangeBar.tsx`
- `apps/desktop/src/renderer/hooks/host-service/useFileDocument.ts`
