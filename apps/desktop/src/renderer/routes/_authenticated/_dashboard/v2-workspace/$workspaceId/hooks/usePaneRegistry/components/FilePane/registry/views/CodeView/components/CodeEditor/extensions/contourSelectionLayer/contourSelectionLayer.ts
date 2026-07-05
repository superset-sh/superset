import { EditorSelection } from "@codemirror/state";
import { type LayerMarker, layer, RectangleMarker } from "@codemirror/view";

// How far past the last character each line's selection rect extends, so the
// selection breathes on the right edge instead of cutting flush with the text.
const TRAILING_PAD = 4;

// Half-line-height-wide stub for empty lines in the middle of a selection so
// the selection reads as contiguous across blank gaps.
const EMPTY_LINE_WIDTH_RATIO = 0.5;

// Custom selection layer: draws selection backgrounds per-line, snug to each
// line's actual text instead of CM's default full-line-width fill for middle
// lines of multi-line selections.
//
// We keep drawSelection() for cursor rendering (including multi-cursor); its
// own .cm-selectionBackground rectangles are hidden via CSS so this layer is
// the only thing painting selection backgrounds.
export const contourSelectionLayer = layer({
	above: false,
	class: "cm-contourSelectionLayer",
	update(update) {
		return (
			update.docChanged ||
			update.viewportChanged ||
			update.selectionSet ||
			update.geometryChanged
		);
	},
	markers(view) {
		const markers: LayerMarker[] = [];
		const lineHeight = view.defaultLineHeight;
		const emptyLineWidth = Math.round(lineHeight * EMPTY_LINE_WIDTH_RATIO);
		for (const range of view.state.selection.ranges) {
			if (range.empty) continue;
			const fromLine = view.state.doc.lineAt(range.from);
			const toLine = view.state.doc.lineAt(range.to);
			for (let n = fromLine.number; n <= toLine.number; n += 1) {
				const line = view.state.doc.line(n);
				const selStart = Math.max(range.from, line.from);
				// Clamp selection end to actual text end so trailing whitespace
				// space past the last visible character is never filled.
				const textEnd = line.from + line.text.length;
				const selEnd = Math.min(range.to, textEnd);
				const isEmpty = selStart >= selEnd;
				const isMiddleLine = n > fromLine.number && n < toLine.number;
				// Skip edge lines that fall in empty territory (selection starts at
				// end-of-line or ends at start-of-line); only show the stub for
				// genuinely empty middle lines.
				if (isEmpty && !isMiddleLine) continue;
				const lineRange = isEmpty
					? EditorSelection.cursor(line.from)
					: EditorSelection.range(selStart, selEnd);
				for (const m of RectangleMarker.forRange(
					view,
					"cm-contourSelection",
					lineRange,
				)) {
					// Expand each rect to fill the full line-cell height. Use exactly
					// lineHeight (no +1) so consecutive rects abut without overlap —
					// overlap darkens at transparent fill alphas into a visible stripe.
					const gap = Math.max(0, lineHeight - m.height);
					const width = isEmpty
						? emptyLineWidth
						: (m.width ?? 0) + TRAILING_PAD;
					markers.push(
						new RectangleMarker(
							"cm-contourSelection",
							m.left,
							m.top - gap / 2,
							width,
							lineHeight,
						),
					);
				}
			}
		}
		return markers;
	},
});
