import type { FrameRect } from "@superset/shared/page-comments-runtime";

const GAP = 8;
const EDGE = 12;

export interface ToolbarPlacement {
	left: number;
	top: number;
}

export function toolbarPlacement({
	rect,
	container,
	size,
}: {
	rect: FrameRect;
	container: { width: number; height: number };
	size: { width: number; height: number };
}): ToolbarPlacement {
	const left = clamp(
		rect.left + rect.width / 2 - size.width / 2,
		container.width - size.width - EDGE,
	);
	const above = rect.top - GAP - size.height;
	const top =
		above >= EDGE
			? above
			: clamp(
					rect.top + rect.height + GAP,
					container.height - size.height - EDGE,
				);
	return { left, top };
}

function clamp(value: number, max: number): number {
	return Math.max(EDGE, Math.min(value, Math.max(EDGE, max)));
}
