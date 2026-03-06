import { cn } from "@superset/ui/utils";
import { useCallback, useRef } from "react";
import type { MosaicNode, MosaicPath } from "react-mosaic-component";

interface BoundingBox {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

interface SplitInfo {
	path: MosaicPath;
	direction: "row" | "column";
	boundingBox: BoundingBox;
	splitPercentage: number;
}

function getAbsoluteSplitPercentage(
	box: BoundingBox,
	splitPercentage: number,
	direction: "row" | "column",
): number {
	if (direction === "column") {
		const height = 100 - box.top - box.bottom;
		return (height * splitPercentage) / 100 + box.top;
	}
	const width = 100 - box.right - box.left;
	return (width * splitPercentage) / 100 + box.left;
}

function getRelativeSplitPercentage(
	box: BoundingBox,
	absolutePercentage: number,
	direction: "row" | "column",
): number {
	if (direction === "column") {
		const height = 100 - box.top - box.bottom;
		return ((absolutePercentage - box.top) / height) * 100;
	}
	const width = 100 - box.right - box.left;
	return ((absolutePercentage - box.left) / width) * 100;
}

function splitBox(
	box: BoundingBox,
	splitPercentage: number,
	direction: "row" | "column",
): { first: BoundingBox; second: BoundingBox } {
	const abs = getAbsoluteSplitPercentage(box, splitPercentage, direction);
	if (direction === "column") {
		return {
			first: { ...box, bottom: 100 - abs },
			second: { ...box, top: abs },
		};
	}
	return {
		first: { ...box, right: 100 - abs },
		second: { ...box, left: abs },
	};
}

function collectSplits(
	node: MosaicNode<string>,
	box: BoundingBox,
	path: MosaicPath,
	out: SplitInfo[],
): void {
	if (typeof node === "string") return;

	const pct = node.splitPercentage ?? 50;
	out.push({
		path,
		direction: node.direction,
		boundingBox: box,
		splitPercentage: pct,
	});

	const { first, second } = splitBox(box, pct, node.direction);
	collectSplits(node.first, first, [...path, "first"], out);
	collectSplits(node.second, second, [...path, "second"], out);
}

const MIN_PERCENTAGE = 20;
const HANDLE_SIZE = 20;

function updateSplitPercentage(
	node: MosaicNode<string>,
	path: MosaicPath,
	newPercentage: number,
): MosaicNode<string> {
	if (path.length === 0) {
		if (typeof node === "string") return node;
		return { ...node, splitPercentage: newPercentage };
	}
	if (typeof node === "string") return node;
	const [head, ...rest] = path;
	return {
		...node,
		[head]: updateSplitPercentage(node[head], rest, newPercentage),
	};
}

function equalizeSplitPercentages(
	node: MosaicNode<string>,
): MosaicNode<string> {
	if (typeof node === "string") return node;
	return {
		...node,
		splitPercentage: 50,
		first: equalizeSplitPercentages(node.first),
		second: equalizeSplitPercentages(node.second),
	};
}

interface MosaicSplitOverlayProps {
	layout: MosaicNode<string>;
	onLayoutChange: (layout: MosaicNode<string>) => void;
}

export function MosaicSplitOverlay({
	layout,
	onLayoutChange,
}: MosaicSplitOverlayProps) {
	const splits: SplitInfo[] = [];
	const emptyBox: BoundingBox = { top: 0, right: 0, bottom: 0, left: 0 };
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
			isDragging.current = true;

			const root = containerRef.current?.closest(
				".mosaic-container",
			) as HTMLElement | null;
			if (!root) return;

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
				document.body.style.userSelect = "";
				document.body.style.cursor = "";
				document.removeEventListener("mousemove", onMouseMove);
				document.removeEventListener("mouseup", onMouseUp);
			};

			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		},
		[
			isRow,
			layout,
			onLayoutChange,
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
			tabIndex={0}
			ref={containerRef}
			onMouseDown={handleMouseDown}
			onDoubleClick={handleDoubleClick}
			className={cn(
				"absolute z-20",
				isRow ? "cursor-col-resize" : "cursor-row-resize",
				"after:absolute after:transition-colors",
				"hover:after:bg-border",
				isRow
					? "after:top-0 after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-px"
					: "after:left-0 after:right-0 after:top-1/2 after:-translate-y-1/2 after:h-px",
			)}
			style={style}
		/>
	);
}
