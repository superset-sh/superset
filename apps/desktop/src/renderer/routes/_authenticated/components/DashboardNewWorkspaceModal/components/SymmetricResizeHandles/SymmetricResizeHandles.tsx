import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { useCallback, useRef } from "react";

interface SymmetricResizeHandlesProps {
	/** Currently rendered box width, for aria-valuenow. */
	currentWidth: number;
	minWidth: number;
	maxWidth: number;
	/** Live width while dragging (not yet persisted). */
	onWidthChange: (width: number) => void;
	/** Final width when the drag ends — persist here. */
	onWidthCommit: (width: number) => void;
	/** Double-click on a handle resets to the default width. */
	onReset: () => void;
}

/**
 * Invisible drag handles on both vertical edges of a horizontally centered
 * box. Dragging either edge resizes the box symmetrically (2px of width per
 * 1px of pointer travel, so the dragged edge tracks the cursor while the
 * opposite edge mirrors it). The parent must be `relative`; the drag start
 * width is measured from the parent's rendered box.
 */
export function SymmetricResizeHandles({
	currentWidth,
	minWidth,
	maxWidth,
	onWidthChange,
	onWidthCommit,
	onReset,
}: SymmetricResizeHandlesProps) {
	const { t } = useLingui();
	const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
	const lastWidthRef = useRef<number | null>(null);

	const clamp = useCallback(
		(width: number) => Math.max(minWidth, Math.min(maxWidth, width)),
		[minWidth, maxWidth],
	);

	const makeHandlers = (side: "left" | "right") => ({
		onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
			if (e.button !== 0) return;
			e.preventDefault();
			const parent = e.currentTarget.parentElement;
			if (!parent) return;
			dragRef.current = {
				startX: e.clientX,
				startWidth: parent.getBoundingClientRect().width,
			};
			lastWidthRef.current = null;
			e.currentTarget.setPointerCapture(e.pointerId);
		},
		onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
			const drag = dragRef.current;
			if (!drag) return;
			const delta = (e.clientX - drag.startX) * (side === "left" ? -2 : 2);
			const width = clamp(drag.startWidth + delta);
			lastWidthRef.current = width;
			onWidthChange(width);
		},
		onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
			if (!dragRef.current) return;
			dragRef.current = null;
			e.currentTarget.releasePointerCapture(e.pointerId);
			if (lastWidthRef.current !== null) onWidthCommit(lastWidthRef.current);
		},
		onDoubleClick: () => {
			dragRef.current = null;
			onReset();
		},
		onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
			if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
			const parent = e.currentTarget.parentElement;
			if (!parent) return;
			e.preventDefault();
			// Arrow pointing away from the box widens it, toward the box narrows it.
			const outward = side === "left" ? "ArrowLeft" : "ArrowRight";
			const step = (e.shiftKey ? 64 : 16) * (e.key === outward ? 1 : -1);
			onWidthCommit(clamp(parent.getBoundingClientRect().width + step));
		},
	});

	return (
		<>
			{(["left", "right"] as const).map((side) => (
				// biome-ignore lint/a11y/useSemanticElements: <hr> is not appropriate for interactive resize handles
				<div
					key={side}
					role="separator"
					aria-orientation="vertical"
					aria-label={
						side === "left"
							? t({
									message: "Resize left edge",
								})
							: t({
									message: "Resize right edge",
								})
					}
					aria-valuenow={Math.round(currentWidth)}
					aria-valuemin={minWidth}
					aria-valuemax={maxWidth}
					tabIndex={0}
					className={cn(
						"absolute top-0 z-20 h-full w-2 cursor-ew-resize touch-none",
						"after:absolute after:inset-y-0 after:w-[2px] after:transition-colors hover:after:bg-border",
						side === "left" ? "left-0 after:left-0" : "right-0 after:right-0",
					)}
					{...makeHandlers(side)}
				/>
			))}
		</>
	);
}
