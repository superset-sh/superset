# Changes sidebar → PierreFileTree (folders + tree view modes)

**Status:** Draft (v2 — addresses self-review pushback)
**Owner:** @kietho
**Created:** 2026-05-10
**Branch:** `changes-sidebar-diffs-tre`

## Premise to confirm before coding

The user said "use diffs tree which we use for file tree." This plan assumes
that means `PierreFileTree` from `@pierre/trees` — the component already
powering `FilesTab` (the v2 files explorer). v2's diff *viewer* (`DiffPane`)
uses `@pierre/diffs` and renders a flat list, not a tree, so it can't be what's
meant. **Confirm before step 1.** If you meant something different, the
component contract below is wrong.

## Problem

The v2 changes sidebar (`ChangesFileList`) renders each changed file as a
single flat row inside category sections (unstaged / staged / against-base /
committed). v1 supported two display modes for navigating large changesets:

- **Folders** — files grouped by their parent folder (one level deep).
- **Tree** — full recursive directory hierarchy.

v2 reimplements neither. v1's `FileListGrouped`, `FileListGroupedVirtualized`,
`FileListTree`, `FileListTreeVirtualized` are four files reinventing
virtualization, expand/collapse, icons, and selection that `@pierre/trees`
already gives `FilesTab` for free.

## Goal

Add v1's two grouping modes (**Folders** and **Tree**) to the v2 changes
sidebar. Tree mode uses `PierreFileTree` (reusing what `FilesTab` does).
Folders mode keeps `FileRow` (see [hybrid approach](#hybrid-renderer-strategy)
for why). Folders is the new default; no flat mode.

## Non-goals

- Touching v1 (`apps/desktop/src/renderer/screens/main/...`). v1 is sunset.
- Changing the `ChangesetFile` data model or the `useChangeset` hook.
- Reworking the diff viewer (`DiffPane`).
- Adding new bulk actions or commit-flow features.

## Hybrid renderer strategy

**Folders mode** keeps the existing `FileRow` component, grouped under
lightweight folder headers (basically v1's `FileListGrouped` pattern, ported
to v2's data model). Why:

- v1's folders mode renders `src/components/Sidebar/` as a *single* row, even
  though it has 3 path segments. `PierreFileTree` builds nested folders from
  nested paths — it does not natively flatten intermediate dirs into one
  segment. Workarounds are all weak: patching upstream, munging path strings
  with a visual separator (and reversing on selection), or accepting Pierre's
  auto-expand-single-child behavior (which may or may not exist in the version
  we ship).
- `FileRow` already carries the per-row chrome we'd otherwise have to rebuild
  as Pierre row decorations: `+N/−N` badges, hover Discard button, hover
  more-actions dropdown, rename arrow, click-policy tooltip, context menu.
  Rebuilding that on top of Pierre's shadow-DOM rendering is real work — the
  `ShadowClickHint` precedent shows it's doable, but the cost is significant
  and entirely avoided here.
- Tree mode still gets the win we actually care about: hierarchy, expand /
  collapse, virtualization, status tints, icons — all from Pierre, no
  reinvention.

**Tree mode** uses `PierreFileTree`, one instance per category section. We
accept the cost of N models (currently 4) because:

- The bulk staging actions on `ChangesSection` headers (unstaged/staged) stay
  declarative — no reinventing them as Pierre header decorations.
- A single file path can appear in *multiple* sections simultaneously (partial
  staging: same `path` in both unstaged and staged). One tree per section means
  each tree's model has a unique key set, and visual selection in one section
  doesn't ghost into another.
- Each section is small in practice; N small models has no perceptible cost.

## View mode toggle

Two modes, persisted to settings:

- **Folders** (default) — `FolderGroup → FileRow[]` per category section.
- **Tree** — one `PierreFileTree` per category section.

The toggle lives in `ChangesHeader`. Persistence: read what `useChangesTab`
already does for tab state (filter selection, base branch, etc.) and add
`changesViewMode: "folders" | "tree"` alongside. **Audit `useChangesTab` in
step 1 of implementation.** If it has no settings store, fall back to the
global desktop settings store used elsewhere.

## Component contract

```
ChangesFileList/
├── ChangesFileList.tsx          # Orchestration: reads viewMode, picks renderer
├── components/
│   ├── ChangesSection/          (existing — no change)
│   ├── ChangesFoldersView/      (NEW — folders mode)
│   │   ├── ChangesFoldersView.tsx  # FolderHeader + FileRow per section
│   │   ├── FolderHeader.tsx
│   │   └── index.ts
│   ├── ChangesTreeView/         (NEW — tree mode)
│   │   ├── ChangesTreeView.tsx     # <PierreFileTree> per section
│   │   ├── RowDecorations.tsx      # +N/-N badge, rename arrow (Pierre slot)
│   │   ├── RowContextMenu.tsx      # Shadow-DOM right-click menu
│   │   ├── ShadowRowHover.tsx      # Discard + more-actions overlay
│   │   └── index.ts
│   ├── FileRow/                 (keep — used by ChangesFoldersView)
│   └── ViewModeToggle/          (NEW — Folders | Tree)
└── utils/
    └── groupFilesByFolder.ts    # Port v1's `groupFilesByFolder`, adapted to ChangesetFile
```

### Selection model

Selection is a `(sectionKind, path)` tuple, not just `path`. The active diff
pane carries `sectionKind` already (it's `file.source.kind`), so we just need
to pipe it through to each renderer. Each `ChangesTreeView` instance is told
"this section's kind is X" and renders `selectedFilePath` only if the active
diff's `sectionKind === X`; otherwise `undefined`. Same for
`ChangesFoldersView`.

### Click-policy extraction

`FilesTab`'s `handleClickCapture` (capture-phase click intercept,
`composedPath()` walk, tier resolution via `useSidebarFilePolicy`,
preventDefault on tier match) needs to run inside `ChangesTreeView` too.
Extract it into a shared hook:

```
apps/desktop/src/renderer/lib/clickPolicy/usePierreRowClickPolicy.ts
```

Returns `{ onClickCapture, findFileRow }` parameterised by `rootPath` and
`onSelectFile`. Then both `FilesTab` and `ChangesTreeView` consume it.
This refactor is a prereq for step 3.

## Risks (after pushback)

1. **Selection in Tree mode across multiple sections.** Solved by the
   `(sectionKind, path)` tuple above — flagging here so the implementer
   doesn't regress to a string.

2. **`PierreFileTree` empty state.** If a section has no files in tree mode,
   bypass Pierre entirely and render nothing (or the existing empty-state
   string). Don't trust Pierre's defaults.

3. **Rebuilding `FileRow` capabilities inside Pierre rows.** Tree mode still
   pays this cost — `+N/−N`, rename arrow, hover Discard, hover more-actions
   dropdown. Plan:
   - `+N/−N` and rename arrow → `renderRowDecoration` (trailing slot).
   - Hover Discard + more-actions → `ShadowRowHover` component patterned on
     `ShadowClickHint` (anchors a light-DOM overlay over the hovered row's
     bounding rect, since Pierre owns row DOM inside a shadow root).
   - Right-click context menu → `renderContextMenu` (Pierre native, same
     wiring `FilesTab` uses).
   - Click policy → shared hook from prereq above.

4. **Status tints in Tree mode.** Feed Pierre a `gitStatus` array via its
   prop — reuse `buildPierreGitStatus` (currently inlined in `FilesTab.tsx`;
   extract to `lib/buildPierreGitStatus.ts` if needed across the two callers).

5. **Performance.** Tree mode is virtualized by Pierre. Folders mode renders
   N `FileRow`s — same as today, plus folder headers. For 5000+ files in a
   single section, folders mode may need virtualization later; not a blocker
   for v1.

6. **Settings store audit.** Plan assumes `useChangesTab` has somewhere to
   persist `changesViewMode`. If it doesn't, step 1 widens to add one.

## Implementation plan (reordered: highest-risk validation first)

1. **Prereq audit.** Read `useChangesTab` to confirm settings persistence
   target. Confirm "diffs tree" = `PierreFileTree` with the user (see
   [Premise](#premise-to-confirm-before-coding)).

2. **Extract `usePierreRowClickPolicy`.** Move `FilesTab`'s click-capture
   logic into a shared hook. Verify `FilesTab` still works identically.

3. **`ChangesFoldersView` end-to-end.** This is the new default mode, low
   risk, reuses `FileRow`. Port v1's `groupFilesByFolder` to v2's
   `ChangesetFile`. Wire one section through it, verify visually, then wire
   all four sections.

4. **`ViewModeToggle` + persistence.** Header toggle. Default Folders. Wire
   `useChangesTab` to store the choice. At this point Folders is shipped
   end-to-end; Tree mode is still placeholder.

5. **`ChangesTreeView` prototype (one section).** Single `PierreFileTree`
   instance for the unstaged section. Pierre's built-ins only: status tints,
   icons, expand/collapse, selection. No row decorations, no hover actions,
   no context menu yet. Click opens the diff. Take a screenshot.

6. **Tree-mode row decorations.** `+N/−N` badge + rename arrow via
   `renderRowDecoration`. Verify legibility at narrow sidebar widths.

7. **Tree-mode context menu.** Port menu items from `FileRow` into a
   `RowContextMenu` returned by `renderContextMenu`. Discard item enabled
   only when `sectionKind === "unstaged"`.

8. **Tree-mode hover actions.** Build `ShadowRowHover` overlay (Discard +
   more-actions dropdown). Tooltip integration via `ShadowClickHint`.

9. **Wire all four sections through `ChangesTreeView`.** Test partial-staging
   case (same file in unstaged + staged) — verify selection stays scoped to
   the active section.

10. **Visual parity pass.** Compare against v1 + current v2 screenshots in
    both modes.

11. **Cleanup.** Delete unused v2 code. (v1 stays.) Confirm no dead exports.

## Test plan

- Workspace with deep file paths; toggle Folders ↔ Tree; both render readable.
- Tree mode: expand/collapse, virtualization at 500+ files in one section,
  status tints match `FilesTab`.
- Right-click in tree mode → all menu items fire correctly; Discard enabled
  only on unstaged.
- Hover in tree mode → Discard works on unstaged only; more-actions dropdown
  opens, all items fire.
- Cmd-click → opens diff in new tab. Cmd-shift-click → external editor. Same
  behavior in both modes.
- Partial-staging case: stage a hunk, leave others unstaged. File appears in
  both sections. Clicking in one section doesn't visually select the row in
  the other.
- Tab switch out and back — view mode persists.
- Empty sections render correctly (no Pierre artifacts).

## Out of scope

- Flat mode (dropped per design call).
- Multi-select for batch stage/unstage.
- Drag-and-drop staging via tree.
- Cross-section keyboard navigation.
- A unified single-tree view (cost/benefit doesn't pencil out — see
  [Hybrid strategy](#hybrid-renderer-strategy)).
