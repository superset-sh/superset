import {
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

const MIN_SCALE = 0.25;
const MAX_SCALE = 16;
const DEFAULT_TRANSFORM: Transform = { scale: 1, x: 0, y: 0 };

export interface Transform {
	scale: number;
	x: number;
	y: number;
}

function zoomAtPoint(
	prev: Transform,
	nextScale: number,
	pointX: number,
	pointY: number,
): Transform {
	const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
	const ratio = scale / prev.scale;
	return {
		scale,
		x: pointX - (pointX - prev.x) * ratio,
		y: pointY - (pointY - prev.y) * ratio,
	};
}

/**
 * Pan/pinch/zoom gestures for a container element. The container must be
 * mounted for the lifetime of the hook so the wheel listener attaches.
 */
export function usePanZoom() {
	const containerRef = useRef<HTMLDivElement>(null);
	const [transform, setTransform] = useState<Transform>(DEFAULT_TRANSFORM);
	const [isDragging, setIsDragging] = useState(false);
	const dragRef = useRef<{
		pointerId: number;
		startX: number;
		startY: number;
		originX: number;
		originY: number;
	} | null>(null);

	const reset = useCallback(() => setTransform(DEFAULT_TRANSFORM), []);

	// Native non-passive listener: React's onWheel can't preventDefault,
	// and trackpad pinch arrives as a wheel event with ctrlKey set.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}
		const handleWheel = (event: WheelEvent) => {
			event.preventDefault();
			if (event.ctrlKey || event.metaKey) {
				const rect = container.getBoundingClientRect();
				const pointX = event.clientX - rect.left - rect.width / 2;
				const pointY = event.clientY - rect.top - rect.height / 2;
				setTransform((prev) =>
					zoomAtPoint(
						prev,
						prev.scale * Math.exp(-event.deltaY * 0.01),
						pointX,
						pointY,
					),
				);
			} else {
				setTransform((prev) => ({
					...prev,
					x: prev.x - event.deltaX,
					y: prev.y - event.deltaY,
				}));
			}
		};
		container.addEventListener("wheel", handleWheel, { passive: false });
		return () => container.removeEventListener("wheel", handleWheel);
	}, []);

	const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (dragRef.current?.pointerId !== event.pointerId) {
			return;
		}
		dragRef.current = null;
		setIsDragging(false);
	};

	const handlers = {
		onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
			if (event.button !== 0 || dragRef.current) {
				return;
			}
			event.currentTarget.setPointerCapture(event.pointerId);
			dragRef.current = {
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				originX: transform.x,
				originY: transform.y,
			};
			setIsDragging(true);
		},
		onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
			const drag = dragRef.current;
			if (!drag || drag.pointerId !== event.pointerId) {
				return;
			}
			setTransform((prev) => ({
				...prev,
				x: drag.originX + event.clientX - drag.startX,
				y: drag.originY + event.clientY - drag.startY,
			}));
		},
		onPointerUp: endDrag,
		onPointerCancel: endDrag,
		onDoubleClick: reset,
		onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => {
			const KEYBOARD_PAN_STEP = 50;
			const actions: Record<string, () => Transform> = {
				"+": () => zoomAtPoint(transform, transform.scale * 1.25, 0, 0),
				"=": () => zoomAtPoint(transform, transform.scale * 1.25, 0, 0),
				"-": () => zoomAtPoint(transform, transform.scale / 1.25, 0, 0),
				"0": () => DEFAULT_TRANSFORM,
				ArrowLeft: () => ({ ...transform, x: transform.x + KEYBOARD_PAN_STEP }),
				ArrowRight: () => ({
					...transform,
					x: transform.x - KEYBOARD_PAN_STEP,
				}),
				ArrowUp: () => ({ ...transform, y: transform.y + KEYBOARD_PAN_STEP }),
				ArrowDown: () => ({ ...transform, y: transform.y - KEYBOARD_PAN_STEP }),
			};
			const action = actions[event.key];
			if (!action || event.ctrlKey || event.metaKey || event.altKey) {
				return;
			}
			event.preventDefault();
			setTransform(action());
		},
	};

	const isTransformed =
		transform.scale !== 1 || transform.x !== 0 || transform.y !== 0;

	return {
		containerRef,
		transform,
		isDragging,
		isTransformed,
		reset,
		handlers,
	};
}
