/**
 * CSS injected into the `@pierre/trees` shadow root via the model's `unsafeCSS`
 * option (lands in `@layer unsafe`, which outranks Pierre's own `@layer base`).
 *
 * Works around a Pierre row-layout bug: the filename lives in
 * `[data-item-section='content']` (`flex: 0 1 auto`) beside an empty, *growing*
 * `[data-item-section='decoration']` lane (`flex: 1 1 0`) that Pierre renders
 * whenever git status is set. When `content`'s `flex-basis: auto` resolves to
 * min-content — which it does in some Chromium builds — the decoration lane
 * hoards the whole row and every name collapses to a middle-ellipsis stub
 * (`.aude`, `node_……dules`) despite empty space to the right.
 *
 * Making `content` the grower (and the decoration lane size to its own content)
 * lets the name claim the available width, so it only truncates on real
 * overflow. Decoration content (the changes-tab `+N/−N`) still right-aligns
 * because the filled content cell pushes it to the row's trailing edge.
 */
export const PIERRE_TREE_UNSAFE_CSS = `
[data-item-section='content'] { flex: 1 1 auto; min-width: 0; }
[data-item-section='decoration'] { flex: 0 1 auto; }
`;
