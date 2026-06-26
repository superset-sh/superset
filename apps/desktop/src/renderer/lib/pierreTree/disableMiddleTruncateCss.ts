/**
 * `@pierre/trees` renders file/folder names through its `MiddleTruncate` helper
 * with `split: "extension"`. For common, short names that don't even need to
 * truncate, the split still happens internally and — when the row's content
 * lane is narrower than the full name — produces visibly broken labels like
 * `node_…dules` or `…gents`. Issue #4619 reports this as the file explorer
 * mangling names "at all sidebar widths".
 *
 * Pierre lives in a shadow root, so we can't reach in with normal stylesheets.
 * `useFileTree({ unsafeCSS })` lets us inject overrides into Pierre's highest
 * cascade layer. The selectors below flatten Pierre's split-grid structure so
 * the name renders as a single contiguous string that the existing
 * `[data-item-section='content']` rule end-truncates with a single trailing
 * ellipsis.
 */
export const DISABLE_MIDDLE_TRUNCATE_CSS = `
[data-item-section='content'] {
	white-space: nowrap;
}

[data-item-section='content'] [data-truncate-group-container='middle'],
[data-item-section='content'] [data-truncate-group-container='middle'] > div,
[data-item-section='content'] [data-truncate-group-container='middle'] [data-truncate-container],
[data-item-section='content'] [data-truncate-group-container='middle'] [data-truncate-grid],
[data-item-section='content'] [data-truncate-group-container='middle'] [data-truncate-content='visible'] {
	display: inline;
	height: auto;
	overflow: visible;
	min-width: 0;
}

[data-item-section='content'] [data-truncate-group-container='middle'] [data-truncate-content='overflow'],
[data-item-section='content'] [data-truncate-group-container='middle'] [data-truncate-marker-cell],
[data-item-section='content'] [data-truncate-group-container='middle'] [data-truncate-fill] {
	display: none;
}

[data-item-section='content'] [data-truncate-group-container='middle'] [data-truncate-container='fruncate'] [data-truncate-content='visible'] {
	direction: ltr;
	unicode-bidi: normal;
}
`;
