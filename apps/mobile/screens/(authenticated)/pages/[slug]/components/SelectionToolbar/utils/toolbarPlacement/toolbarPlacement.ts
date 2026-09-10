import type { FrameRect } from "@superset/shared/page-comments-runtime";

const GAP = 8;
const EDGE = 8;

export function toolbarPlacement({
	rect,
	container,
	size,
}: {
	rect: FrameRect;
	container: { width: number; height: number };
	size: { width: number; height: number };
}): { left: number; top: number } {
	const above = rect.top - size.height - GAP;
	const below = rect.top + rect.height + GAP;
	const top = above >= EDGE ? above : below;

	return {
		left: clamp(
			rect.left + rect.width / 2 - size.width / 2,
			EDGE,
			Math.max(EDGE, container.width - size.width - EDGE),
		),
		top: clamp(
			top,
			EDGE,
			Math.max(EDGE, container.height - size.height - EDGE),
		),
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
