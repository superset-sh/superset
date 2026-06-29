export const DEFAULT_CODE_EDITOR_FONT_FAMILY =
	"ui-monospace, Menlo, Consolas, Liberation Mono, monospace";
export const DEFAULT_CODE_EDITOR_FONT_SIZE = 13;

/** Debounce window for the selection-change notification. CodeMirror fires
 *  `selectionSet` on every cursor move; we only need to recompute selection-
 *  derived UI (the "Send selection to agent" affordance) once the selection
 *  settles — mirroring the DiffPane sibling's gesture-end (`onLineSelectionEnd`)
 *  cadence rather than per-keystroke. */
export const SELECTION_CHANGE_DEBOUNCE_MS = 120;
