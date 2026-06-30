import type { MosaicBranch } from "react-mosaic-component";
import type { MosaicDropPosition } from "../types";

/**
 * The result of releasing a dragged tab header in the tab strip.
 *
 * - `reorder`: the tab was repositioned within the strip. The new order is
 *   applied optimistically while dragging (in the drop target's `hover`
 *   handler), so the `end` handler has nothing left to commit.
 * - `merge`: the tab should be merged into another tab as a pane.
 */
export type TabHeaderDropResolution =
	| { kind: "reorder" }
	| {
			kind: "merge";
			sourceTabId: string;
			targetTabId: string;
			path: MosaicBranch[];
			position: MosaicDropPosition;
	  };

export interface ResolveTabHeaderDropParams {
	/** The tab being dragged. */
	draggedTabId: string;
	/**
	 * Any Mosaic drop result reported by the drag backend. Present only when a
	 * drag was released over one of Mosaic's split indicators. Tab-header drags
	 * intentionally do not use `MosaicDragType.WINDOW`, so this is normally
	 * `null`; it is accepted here so the resolver stays the single source of
	 * truth that such a drop must never merge.
	 */
	mosaicDrop: { path?: MosaicBranch[]; position?: string } | null;
	/** The currently active tab in the dragged tab's workspace. */
	activeTabId: string | null;
}

/**
 * Decides what happens when a dragged tab header is released.
 *
 * Reordering a tab within the strip must never collapse it into another tab —
 * the two interactions are kept distinct (see issue #5099). The previous
 * implementation typed tab drags as `MosaicDragType.WINDOW` and merged whenever
 * Mosaic's split indicators captured the drop, which hijacked plain horizontal
 * reordering. Tab-header drags now always reorder; merging a pane into a tab is
 * a separate interaction driven by dragging the pane via its Mosaic window
 * toolbar (handled by `onPaneDrop`).
 */
export function resolveTabHeaderDrop(
	_params: ResolveTabHeaderDropParams,
): TabHeaderDropResolution {
	return { kind: "reorder" };
}
