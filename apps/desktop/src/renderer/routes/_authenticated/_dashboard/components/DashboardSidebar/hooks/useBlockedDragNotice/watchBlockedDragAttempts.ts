import { DRAG_ACTIVATION_DISTANCE_PX } from "../useSidebarDnd/constants";

export const BLOCKED_DRAG_ATTRIBUTE = "data-sidebar-drag-blocked";

export function getBlockedDragProps(isBlocked: boolean) {
	return isBlocked ? { [BLOCKED_DRAG_ATTRIBUTE]: true } : {};
}

type PointerLike = Pick<
	PointerEvent,
	"button" | "clientX" | "clientY" | "target"
>;

/**
 * Reports a press-and-move on a row whose sortable is inert. A disabled
 * dnd-kit sortable emits nothing, so an attempted drag would otherwise look
 * like the sidebar ignoring the user. Sharing the mouse sensor's activation
 * distance means a plain click never counts.
 */
export function watchBlockedDragAttempts(
	root: Pick<EventTarget, "addEventListener" | "removeEventListener">,
	onBlockedDrag: () => void,
): () => void {
	let stopTracking: (() => void) | null = null;

	const handlePointerDown = (event: Event) => {
		const { button, clientX, clientY, target } =
			event as unknown as PointerLike;
		stopTracking?.();
		if (button !== 0) return;
		const element = target as Element | null;
		if (!element?.closest?.(`[${BLOCKED_DRAG_ATTRIBUTE}]`)) return;

		const handlePointerMove = (moveEvent: Event) => {
			const move = moveEvent as unknown as PointerLike;
			const distance = Math.hypot(
				move.clientX - clientX,
				move.clientY - clientY,
			);
			if (distance < DRAG_ACTIVATION_DISTANCE_PX) return;
			stopTracking?.();
			onBlockedDrag();
		};
		const handlePointerEnd = () => stopTracking?.();

		root.addEventListener("pointermove", handlePointerMove);
		root.addEventListener("pointerup", handlePointerEnd);
		root.addEventListener("pointercancel", handlePointerEnd);
		stopTracking = () => {
			root.removeEventListener("pointermove", handlePointerMove);
			root.removeEventListener("pointerup", handlePointerEnd);
			root.removeEventListener("pointercancel", handlePointerEnd);
			stopTracking = null;
		};
	};

	root.addEventListener("pointerdown", handlePointerDown);
	return () => {
		stopTracking?.();
		root.removeEventListener("pointerdown", handlePointerDown);
	};
}
