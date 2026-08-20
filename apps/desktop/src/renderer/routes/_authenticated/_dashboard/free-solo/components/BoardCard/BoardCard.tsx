import { cn } from "@superset/ui/utils";
import {
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { HiXMark } from "react-icons/hi2";
import {
	type BoardCard as BoardCardModel,
	MIN_CARD_HEIGHT,
	MIN_CARD_WIDTH,
	useFreeSoloBoardStore,
} from "renderer/stores/free-solo-board";
import { type DragOrigin, dragPosition } from "./geometry";

interface BoardCardProps {
	card: BoardCardModel;
	title: ReactNode;
	children: ReactNode;
}

/** Debounce window for committing a settled resize. ResizeObserver fires on
 *  every frame while the native grip is dragged, and resizeCard persists to
 *  localStorage on every call — this buffers those frames into one write. */
const RESIZE_COMMIT_DELAY_MS = 200;

export function BoardCard({ card, title, children }: BoardCardProps) {
	const isActive = useFreeSoloBoardStore(
		(state) => state.activeCardId === card.id,
	);
	const raiseCard = useFreeSoloBoardStore((state) => state.raiseCard);
	const removeCard = useFreeSoloBoardStore((state) => state.removeCard);
	const moveCard = useFreeSoloBoardStore((state) => state.moveCard);
	const resizeCard = useFreeSoloBoardStore((state) => state.resizeCard);

	// Drag lives in local state so a gesture is one store write, not one per
	// pointer event — every write hits localStorage through `persist`. The
	// pointerId rides along so a second pointer landing mid-drag can't hijack
	// the gesture (same shape as usePanZoom's dragRef).
	const dragOriginRef = useRef<(DragOrigin & { pointerId: number }) | null>(
		null,
	);
	const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
		null,
	);

	const sizedRef = useRef<HTMLDivElement | null>(null);
	// Kept fresh every render (not just in the effect below) so the observer
	// callback — which does not re-subscribe on every store update — always
	// compares against the size already persisted, without a stale closure.
	const committedSizeRef = useRef({ w: card.w, h: card.h });
	committedSizeRef.current = { w: card.w, h: card.h };
	const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const element = sizedRef.current;
		if (!element) return;
		// The native resize grip has no event of its own; observe the box it
		// changes. ResizeObserver fires on every frame while the box is
		// actively being resized (and once more on mount) — not once at
		// gesture end — so we buffer the latest observed size and commit it
		// only after it settles, the same one-write-per-gesture contract as
		// drag. The observed element must be the SAME element that carries
		// the width/height style, or the observation feeds back into a
		// shrink loop: outer − chrome → body → smaller outer → …
		const observer = new ResizeObserver(() => {
			const { width, height } = element.getBoundingClientRect();
			if (width < 1 || height < 1) return;
			const committed = committedSizeRef.current;
			if (
				Math.round(width) === committed.w &&
				Math.round(height) === committed.h
			) {
				return;
			}
			if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
			resizeTimeoutRef.current = setTimeout(() => {
				resizeCard(card.id, width, height);
			}, RESIZE_COMMIT_DELAY_MS);
		});
		observer.observe(element);
		return () => {
			observer.disconnect();
			if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
		};
	}, [card.id, resizeCard]);

	const position = dragOffset ?? { x: card.x, y: card.y };

	// Shared by pointerup and pointercancel: a cancelled gesture (e.g. the
	// browser reclaiming the pointer mid-drag) still commits the last known
	// position rather than leaving the card at an un-persisted local offset.
	const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
		const origin = dragOriginRef.current;
		// Ignore an end for a pointer that isn't the one dragging. Releasing
		// capture unconditionally, as this used to, throws NotFoundError out of
		// the handler when the pointer was already released — which is exactly
		// what a pointercancel following a pointerup is.
		if (!origin || origin.pointerId !== event.pointerId) return;
		dragOriginRef.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		const next = dragPosition(origin, {
			pointerX: event.clientX,
			pointerY: event.clientY,
		});
		setDragOffset(null);
		moveCard(card.id, next.x, next.y);
	};

	return (
		<div
			ref={sizedRef}
			className={cn(
				// `resize` needs a non-visible overflow. This element owns both the
				// size style and the ResizeObserver — see the effect above.
				"absolute flex resize flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm",
				isActive && "ring-1 ring-ring",
			)}
			style={{
				left: position.x,
				top: position.y,
				width: card.w,
				height: card.h,
				minWidth: MIN_CARD_WIDTH,
				minHeight: MIN_CARD_HEIGHT,
				zIndex: card.z,
			}}
			onPointerDownCapture={() => raiseCard(card.id)}
		>
			<div
				className="flex shrink-0 cursor-grab items-center gap-2 border-b border-border px-2 py-1 active:cursor-grabbing"
				onPointerDown={(event) => {
					// Pointer capture retargets the compatibility mouse events —
					// including the `click` the browser synthesises — to the
					// capturing element. Capturing here on a press that started
					// inside the close button would swallow that button's click
					// and leave the card unremovable, so the title bar declines
					// the gesture and lets the button have it. Primary button
					// only, one pointer at a time: usePanZoom's precedent.
					if (
						event.button !== 0 ||
						dragOriginRef.current ||
						(event.target as Element).closest("button")
					) {
						return;
					}
					event.currentTarget.setPointerCapture(event.pointerId);
					dragOriginRef.current = {
						pointerId: event.pointerId,
						x: card.x,
						y: card.y,
						pointerX: event.clientX,
						pointerY: event.clientY,
					};
				}}
				onPointerMove={(event) => {
					const origin = dragOriginRef.current;
					if (!origin || origin.pointerId !== event.pointerId) return;
					setDragOffset(
						dragPosition(origin, {
							pointerX: event.clientX,
							pointerY: event.clientY,
						}),
					);
				}}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
			>
				<div className="min-w-0 flex-1">{title}</div>
				<button
					type="button"
					aria-label="Remove card"
					className="rounded p-0.5 text-muted-foreground hover:bg-fill-hover hover:text-foreground"
					onClick={() => removeCard(card.id)}
				>
					<HiXMark className="size-3.5" />
				</button>
			</div>
			{/* Bottom padding keeps the resize corner as the card's own, so the
			    grip isn't buried under xterm's screen. */}
			<div className="flex min-h-0 flex-1 overflow-hidden p-1 pb-3">
				{children}
			</div>
		</div>
	);
}
