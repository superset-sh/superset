# V2 Diff Pane — @pierre/diffs follow-ups

Status: queued
Owner: desktop
Related: PR #4898 (port v2 DiffPane to CodeView)

PR #4898 swapped the v2 DiffPane from custom virtualizer + DOM-query scroll
to `@pierre/diffs` `CodeView`. While auditing the library surface we
identified three follow-ups worth doing once we have product intent — they
all hang off APIs that are already wired through the version we shipped
(`@pierre/diffs@1.2.2`), so no further upgrade is needed to land them.

## 1. In-diff "+ comment" affordance (gutter utility)

Pierre exposes a per-row hover slot via `enableGutterUtility: true` plus
`renderGutterUtility(getHoveredLine, item)`. The natural use case is a
"+" button that appears in the line gutter on hover and lets the user
start a new GitHub review comment anchored to that line (additions or
deletions side).

Wiring needed:
- `useDiffCodeViewTheme.ts`: add `enableGutterUtility: true` to options.
- `DiffPane.tsx`: pass `renderGutterUtility` to `CodeView`.
- New `DiffGutterUtility` component: button → opens the existing
  comment-compose flow (see how the sidebar Review tab does it today)
  scoped to `{ path, line, side }`.

Out of scope until we decide: posting comments directly from desktop vs.
deep-linking to GitHub.

## 2. Multi-line comment ranges (line selection)

Pierre's `enableLineSelection: true` + `onLineSelected(range)` + the
controlled `selectedLines` prop give us drag-to-select line ranges with a
`SelectedLineRange` of `{ start, side, end, endSide }`. Pairs naturally
with (1): once we have line selection, the gutter "+" can anchor to a
range instead of a single line, matching GitHub's multi-line review
comments.

Wiring needed:
- `useDiffCodeViewTheme.ts`: add `enableLineSelection: true`.
- `DiffPane.tsx`: hold selection state, pass `selectedLines` +
  `onSelectedLinesChange` to `CodeView`.
- Surface the selection in the new-comment flow from (1).

Pierre persists selection per item (keyed by `item.id`); switching files
clears it. We may want to clear on `data.path` change explicitly to avoid
a stale selection surfacing when the pane re-targets a file.

## 3. Renamed-file annotation QA

Not a code change — verify in the browser. Today
`useDiffCodeViewItems.getAnnotationsForFile` concats `oldPath` + `path`
annotation arrays, and `parseDiffFromFile` is given `oldFile.name =
file.oldPath` and `newFile.name = file.path`. A LEFT-side comment from
the pre-rename path should map to a deletion line in the rendered diff.
Pierre's default header still renders `[data-prev-name] → [data-title]`
(we only hid `[data-change-icon]`), so the rename UX is preserved
visually.

Reproduce: find or stage a PR with a renamed-with-edits file that has at
least one review comment anchored on the old path, open it in the v2
diff pane, click the comment in the Review tab, confirm jump-to-line
lands on the deletion side at the correct line.

## Notes (decided not to do)

- **`MultiFileDiff`** — for a single patch containing many files. Doesn't
  match our model (one query per file, fetched independently). Stay on
  `CodeView` with `items[]`.
- **`__devOnlyValidateItemHeights`** — useful only if we customize
  `itemMetrics`. We use Pierre's defaults so there's nothing to validate.
- **`MultiFileDiff` vs custom header height** — N/A.
