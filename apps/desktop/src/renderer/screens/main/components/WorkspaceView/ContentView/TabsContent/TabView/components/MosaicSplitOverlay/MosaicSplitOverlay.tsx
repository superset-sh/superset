import { cn } from "@superset/ui/utils";
import { useCallback, useRef } from "react";
import type { MosaicNode, MosaicPath } from "react-mosaic-component";
import { useDragPaneStore } from "renderer/stores/drag-pane-store";
import {
	HANDLE_SIZE,
	KEYBOARD_STEP,
	MIN_PERCENTAGE,
	type SplitInfo,
	collectSplits,
	equalizeSplitPercentages,
	getAbsoluteSplitPercentage,
	getRelativeSplitPercentage,
	splitBox,
	updateSplitPercentage,
} from "./mosaicSplitUtils";

interface MosaicSplitOverlayProps {
	layout: MosaicNode<string>;
	onLayoutChange: (layout: MosaicNode<string>) => void;
}

export function MosaicSplitOverlay({
	layout,
	onLayoutChange,
}: MosaicSplitOverlayProps) {
	const splits: SplitInfo[] = [];
	const emptyBox = { top: 0, right: 0, bottom: 0, left: 0 };
	collectSplits(layout, emptyBox, [], splits);

	if (splits.length === 0) return null;

	return (
		<>
			{splits.map((split) => (
				<SplitHandle
					key={split.path.join(",")}
					split={split}
					layout={layout}
					onLayoutChange={onLayoutChange}
				/>
			))}
		</>
	);
}

interface SplitHandleProps {
	split: SplitInfo;
	layout: MosaicNode<string>;
	onLayoutChange: (layout: MosaicNode<string>) => void;
}

function SplitHandle({ split, layout, onLayoutChange }: SplitHandleProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const isDragging = useRef(false);
	const setResizing = useDragPaneStore((s) => s.setResizing);

	const absolutePosition = getAbsoluteSplitPercentage(
		split.boundingBox,
		split.splitPercentage,
		split.direction,
	);

	const isRow = split.direction === "row";

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const root = containerRef.current?.closest(
				".mosaic-container",
			) as HTMLElement | null;
			if (!root) return;

			isDragging.current = true;
			setResizing(true);

			document.body.style.userSelect = "none";
			document.body.style.cursor = isRow ? "col-resize" : "row-resize";

			const onMouseMove = (moveEvent: MouseEvent) => {
				const rect = root.getBoundingClientRect();
				let absolutePct: number;
				if (isRow) {
					absolutePct = ((moveEvent.clientX - rect.left) / rect.width) * 100;
				} else {
					absolutePct = ((moveEvent.clientY - rect.top) / rect.height) * 100;
				}

				const relativePct = getRelativeSplitPercentage(
					split.boundingBox,
					absolutePct,
					split.direction,
				);
				const clamped = Math.max(
					MIN_PERCENTAGE,
					Math.min(100 - MIN_PERCENTAGE, relativePct),
				);
				const newLayout = updateSplitPercentage(layout, split.path, clamped);
				onLayoutChange(newLayout);
			};

			const onMouseUp = () => {
				isDragging.current = false;
				setResizing(false);
				document.body.style.userSelect = "";
				document.body.style.cursor = "";
				document.removeEventListener("mousemove", onMouseMove);
				document.removeEventListener("mouseup", onMouseUp);
				window.removeEventListener("blur", onMouseUp);
			};

			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
			window.addEventListener("blur", onMouseUp);
		},
		[
			isRow,
			layout,
			onLayoutChange,
			setResizing,
			split.boundingBox,
			split.direction,
			split.path,
		],
	);

	const handleDoubleClick = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			onLayoutChange(equalizeSplitPercentages(layout));
		},
		[layout, onLayoutChange],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			const increase = isRow ? "ArrowRight" : "ArrowDown";
			const decrease = isRow ? "ArrowLeft" : "ArrowUp";

			if (e.key === increase || e.key === decrease) {
				e.preventDefault();
				const delta = e.key === increase ? KEYBOARD_STEP : -KEYBOARD_STEP;
				const next = Math.max(
					MIN_PERCENTAGE,
					Math.min(100 - MIN_PERCENTAGE, split.splitPercentage + delta),
				);
				onLayoutChange(updateSplitPercentage(layout, split.path, next));
			} else if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				onLayoutChange(equalizeSplitPercentages(layout));
			}
		},
		[isRow, layout, onLayoutChange, split.path, split.splitPercentage],
	);

	const style: React.CSSProperties = isRow
		? {
				top: `${split.boundingBox.top}%`,
				bottom: `${split.boundingBox.bottom}%`,
				left: `calc(${absolutePosition}% - ${HANDLE_SIZE / 2}px)`,
				width: HANDLE_SIZE,
			}
		: {
				left: `${split.boundingBox.left}%`,
				right: `${split.boundingBox.right}%`,
				top: `calc(${absolutePosition}% - ${HANDLE_SIZE / 2}px)`,
				height: HANDLE_SIZE,
			};

	return (
		// biome-ignore lint/a11y/useSemanticElements: <hr> is not appropriate for interactive resize handles
		<div
			role="separator"
			aria-orientation={isRow ? "vertical" : "horizontal"}
			aria-valuenow={Math.round(split.splitPercentage)}
			aria-valuemin={MIN_PERCENTAGE}
			aria-valuemax={100 - MIN_PERCENTAGE}
			aria-label={isRow ? "Vertical split handle" : "Horizontal split handle"}
			tabIndex={0}
			ref={containerRef}
			onMouseDown={handleMouseDown}
			onDoubleClick={handleDoubleClick}
			onKeyDown={handleKeyDown}
			className={cn(
				"absolute z-20",
				isRow ? "cursor-col-resize" : "cursor-row-resize",
				"after:absolute after:transition-colors",
				"hover:after:bg-border focus-visible:after:bg-border",
				isRow
					? "after:top-0 after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-px"
					: "after:left-0 after:right-0 after:top-1/2 after:-translate-y-1/2 after:h-px",
			)}
			style={style}
		/>
	);
}
