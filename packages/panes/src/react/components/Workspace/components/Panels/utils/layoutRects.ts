import type { PanelLayoutNode } from "../../../../../../types";

/** A rectangle in container-relative percentages (0–100). */
export interface PanelRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

/**
 * Compute each panel's rectangle from a layout tree, mirroring how
 * ResizablePanelGroup divides space. Percentages (not pixels) so the result
 * is resolution-independent and maps directly to CSS `%`.
 */
export function computePanelRects(
	node: PanelLayoutNode,
	rect: PanelRect = { left: 0, top: 0, width: 100, height: 100 },
	out: Map<string, PanelRect> = new Map(),
): Map<string, PanelRect> {
	if (node.type === "pane") {
		out.set(node.paneId, rect);
		return out;
	}

	const firstFraction = (node.splitPercentage ?? 50) / 100;
	if (node.direction === "horizontal") {
		const firstWidth = rect.width * firstFraction;
		computePanelRects(node.first, { ...rect, width: firstWidth }, out);
		computePanelRects(
			node.second,
			{
				left: rect.left + firstWidth,
				top: rect.top,
				width: rect.width - firstWidth,
				height: rect.height,
			},
			out,
		);
	} else {
		const firstHeight = rect.height * firstFraction;
		computePanelRects(node.first, { ...rect, height: firstHeight }, out);
		computePanelRects(
			node.second,
			{
				left: rect.left,
				top: rect.top + firstHeight,
				width: rect.width,
				height: rect.height - firstHeight,
			},
			out,
		);
	}
	return out;
}
