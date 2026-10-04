// biome-ignore-all lint/a11y/useSemanticElements: cells are placed absolutely, so ARIA grid roles stand in for table elements
// biome-ignore-all lint/a11y/useFocusableInteractive: the grid is the one tab stop and announces the active cell
import { cn } from "@superset/ui/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	type KeyboardEvent,
	type PointerEvent,
	type Ref,
	useCallback,
	useEffect,
	useId,
	useImperativeHandle,
	useMemo,
	useRef,
} from "react";
import { PLATFORM } from "renderer/hotkeys";
import type {
	CellPosition,
	CellRange,
	GridCell,
	SheetSummary,
} from "../../types";
import {
	cellAddress,
	columnAtOffset,
	columnStarts,
	gutterWidth,
	HEADER_HEIGHT,
	ROW_HEIGHT,
	rangeAddress,
	revealOffset,
} from "../../utils/gridGeometry";
import {
	activeCellRange,
	moveSelection,
	type Selection,
	selectionRange,
} from "../../utils/selection";
import { CellLayer, type MatchState } from "./components/CellLayer";
import { ColumnHeader } from "./components/ColumnHeader";
import { RowHeader } from "./components/RowHeader";
import { HEADER_SURFACE } from "./constants";

export interface SheetGridHandle {
	reveal: (cell: CellPosition) => void;
	focus: () => void;
}

interface SheetGridProps {
	ref?: Ref<SheetGridHandle>;
	label: string;
	sheet: SheetSummary;
	widths: number[];
	getCell: (row: number, col: number) => GridCell | null | undefined;
	ensureCells: (ranges: CellRange[]) => void;
	selection: Selection;
	onSelectionChange: (selection: Selection) => void;
	onColumnResize: (col: number, width: number | null) => void;
	onCopy: () => void;
	onSheetStep: (delta: 1 | -1) => void;
	matchKeys: Set<number> | null;
	activeMatch: CellPosition | null;
}

type DragMode = "cells" | "rows" | "cols";

const range = (from: number, to: number) =>
	Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

const FROZEN_EDGE =
	"pointer-events-none absolute z-[11] bg-muted-foreground/40";

export function SheetGrid({
	ref,
	label,
	sheet,
	widths,
	getCell,
	ensureCells,
	selection,
	onSelectionChange,
	onColumnResize,
	onCopy,
	onSheetStep,
	matchKeys,
	activeMatch,
}: SheetGridProps) {
	const gridId = useId();
	const scrollRef = useRef<HTMLDivElement>(null);
	const drag = useRef<{ mode: DragMode; anchor: CellPosition } | null>(null);
	const { rowCount, colCount, merges } = sheet;
	const gutter = gutterWidth(rowCount);
	const starts = useMemo(() => columnStarts(widths), [widths]);
	const totalWidth = gutter + (starts.at(-1) ?? 0);
	const totalHeight = HEADER_HEIGHT + rowCount * ROW_HEIGHT;

	const rows = useVirtualizer({
		count: rowCount,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		paddingStart: HEADER_HEIGHT,
		overscan: 10,
	});
	const cols = useVirtualizer({
		horizontal: true,
		count: colCount,
		getScrollElement: () => scrollRef.current,
		estimateSize: (index) => widths[index] ?? 0,
		paddingStart: gutter,
		overscan: 3,
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: widths feed estimateSize, which the virtualizer only rereads on measure()
	useEffect(() => {
		cols.measure();
	}, [cols, widths]);

	// A frozen pane never takes more than half of the view.
	const viewWidth = cols.scrollRect?.width ?? 0;
	const viewHeight = rows.scrollRect?.height ?? 0;
	const frozenRows = Math.max(
		0,
		Math.min(
			sheet.frozen.rows,
			Math.floor((viewHeight - HEADER_HEIGHT) / 2 / ROW_HEIGHT),
		),
	);
	let frozenCols = Math.min(sheet.frozen.cols, colCount);
	while (
		frozenCols > 0 &&
		(starts[frozenCols] ?? 0) > (viewWidth - gutter) / 2
	) {
		frozenCols -= 1;
	}
	const frozenWidth = starts[frozenCols] ?? 0;
	const frozenHeight = frozenRows * ROW_HEIGHT;
	const stickyTop = HEADER_HEIGHT + frozenHeight;
	const stickyLeft = gutter + frozenWidth;

	const rowItems = rows.getVirtualItems();
	const colItems = cols.getVirtualItems();
	const firstRow = rowItems[0]?.index ?? 0;
	const lastRow = rowItems.at(-1)?.index ?? 0;
	const firstCol = colItems[0]?.index ?? 0;
	const lastCol = colItems.at(-1)?.index ?? 0;
	const scrollRows = rowItems
		.map((item) => item.index)
		.filter((row) => row >= frozenRows);
	const scrollCols = colItems
		.map((item) => item.index)
		.filter((col) => col >= frozenCols);
	const pinnedRows = range(0, frozenRows);
	const pinnedCols = range(0, frozenCols);

	const visibleMerges = useMemo(
		() =>
			merges.filter(
				(merge) =>
					merge.top <= lastRow &&
					(merge.bottom >= firstRow || merge.top < frozenRows) &&
					merge.left <= lastCol &&
					(merge.right >= firstCol || merge.left < frozenCols),
			),
		[merges, firstRow, lastRow, firstCol, lastCol, frozenRows, frozenCols],
	);

	useEffect(() => {
		const ranges: CellRange[] = [
			{ top: firstRow, bottom: lastRow, left: firstCol, right: lastCol },
		];
		if (frozenRows > 0) {
			ranges.push({
				top: 0,
				bottom: frozenRows - 1,
				left: firstCol,
				right: lastCol,
			});
		}
		if (frozenCols > 0) {
			ranges.push({
				top: 0,
				bottom: lastRow,
				left: 0,
				right: frozenCols - 1,
			});
		}
		for (const merge of visibleMerges) {
			ranges.push({
				top: merge.top,
				bottom: merge.top,
				left: merge.left,
				right: merge.left,
			});
		}
		ensureCells(ranges);
	}, [
		ensureCells,
		firstRow,
		lastRow,
		firstCol,
		lastCol,
		frozenRows,
		frozenCols,
		visibleMerges,
	]);

	const reveal = useCallback(
		(cell: CellPosition) => {
			const element = scrollRef.current;
			if (!element) return;
			if (cell.row >= frozenRows) {
				const top = HEADER_HEIGHT + cell.row * ROW_HEIGHT;
				const y = revealOffset(
					top,
					top + ROW_HEIGHT,
					element.scrollTop,
					element.clientHeight,
					stickyTop,
				);
				if (y !== null) element.scrollTop = y;
			}
			if (cell.col >= frozenCols) {
				const x = revealOffset(
					gutter + (starts[cell.col] ?? 0),
					gutter + (starts[cell.col + 1] ?? 0),
					element.scrollLeft,
					element.clientWidth,
					stickyLeft,
				);
				if (x !== null) element.scrollLeft = x;
			}
		},
		[gutter, starts, frozenRows, frozenCols, stickyTop, stickyLeft],
	);

	useImperativeHandle(
		ref,
		() => ({
			reveal,
			focus: () => scrollRef.current?.focus({ preventScroll: true }),
		}),
		[reveal],
	);

	const selected = selectionRange(selection, merges);
	const active = activeCellRange(selection, merges);
	const isMultiCell =
		selected.top !== active.top ||
		selected.left !== active.left ||
		selected.bottom !== active.bottom ||
		selected.right !== active.right;
	const lastRowIndex = rowCount - 1;
	const lastColIndex = colCount - 1;
	const allCells: Selection = {
		anchor: { row: 0, col: 0 },
		head: { row: lastRowIndex, col: lastColIndex },
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		// Keys typed in a column resize handle are its own.
		if (event.target !== event.currentTarget) return;
		const primaryKey = PLATFORM === "mac" ? event.metaKey : event.ctrlKey;
		const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
		if (primaryKey && key === "c") {
			event.preventDefault();
			onCopy();
			return;
		}
		if (primaryKey && key === "a") {
			event.preventDefault();
			onSelectionChange(allCells);
			return;
		}
		if (event.ctrlKey && (key === "PageDown" || key === "PageUp")) {
			event.preventDefault();
			onSheetStep(key === "PageDown" ? 1 : -1);
			return;
		}
		if (key === "Escape" && isMultiCell) {
			event.preventDefault();
			onSelectionChange({ anchor: selection.anchor, head: selection.anchor });
			return;
		}
		if (event.altKey) return;
		const element = scrollRef.current;
		const pageRows = element
			? Math.max(
					1,
					Math.floor((element.clientHeight - stickyTop) / ROW_HEIGHT) - 1,
				)
			: 1;
		const next = moveSelection(
			selection,
			{ key, shiftKey: event.shiftKey, primaryKey },
			{ rows: rowCount, cols: colCount },
			pageRows,
			merges,
		);
		if (!next) return;
		// Tab at the first or last column leaves the grid instead of trapping focus.
		if (
			key === "Tab" &&
			next.anchor.row === selection.anchor.row &&
			next.anchor.col === selection.anchor.col
		) {
			return;
		}
		event.preventDefault();
		onSelectionChange(next);
		reveal(next.head);
	};

	const pointerTarget = (event: PointerEvent<HTMLDivElement>) => {
		const element = event.currentTarget;
		const bounds = element.getBoundingClientRect();
		const viewX = event.clientX - bounds.left;
		const viewY = event.clientY - bounds.top;
		const x =
			(viewX < stickyLeft ? viewX : viewX + element.scrollLeft) - gutter;
		const y =
			(viewY < stickyTop ? viewY : viewY + element.scrollTop) - HEADER_HEIGHT;
		return {
			viewX,
			viewY,
			cell: {
				row: Math.max(0, Math.min(Math.floor(y / ROW_HEIGHT), lastRowIndex)),
				col: Math.min(columnAtOffset(starts, Math.max(0, x)), lastColIndex),
			},
			onScrollbar:
				viewX >= element.clientWidth || viewY >= element.clientHeight,
		};
	};

	const selectionFor = (
		mode: DragMode,
		anchor: CellPosition,
		head: CellPosition,
	): Selection => {
		if (mode === "rows") {
			return {
				anchor: { row: anchor.row, col: 0 },
				head: { row: head.row, col: lastColIndex },
			};
		}
		if (mode === "cols") {
			return {
				anchor: { row: 0, col: anchor.col },
				head: { row: lastRowIndex, col: head.col },
			};
		}
		return { anchor, head };
	};

	const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		const { viewX, viewY, cell, onScrollbar } = pointerTarget(event);
		if (onScrollbar) return;
		const inHeader = viewY < HEADER_HEIGHT;
		const inGutter = viewX < gutter;
		if (inHeader && inGutter) {
			onSelectionChange(allCells);
			return;
		}
		const mode: DragMode = inHeader ? "cols" : inGutter ? "rows" : "cells";
		const anchor = event.shiftKey ? selection.anchor : cell;
		drag.current = { mode, anchor };
		event.currentTarget.setPointerCapture(event.pointerId);
		onSelectionChange(selectionFor(mode, anchor, cell));
	};

	const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
		const current = drag.current;
		if (!current) return;
		const { cell } = pointerTarget(event);
		const next = selectionFor(current.mode, current.anchor, cell);
		if (
			next.head.row === selection.head.row &&
			next.head.col === selection.head.col
		) {
			return;
		}
		onSelectionChange(next);
		if (current.mode === "cells") reveal(cell);
	};

	const endDrag = () => {
		drag.current = null;
	};

	const matchState = (row: number, col: number): MatchState => {
		if (activeMatch && activeMatch.row === row && activeMatch.col === col) {
			return "active";
		}
		return matchKeys?.has(row * colCount + col) ? "match" : "none";
	};

	const layer = {
		gutter,
		starts,
		merges: visibleMerges,
		getCell,
		matchState,
		selection: isMultiCell ? selected : null,
		ariaSelection: selected,
		active,
		gridId,
	};
	const columnHeader = (col: number, left: number) => (
		<ColumnHeader
			key={col}
			col={col}
			left={left}
			width={widths[col] ?? 0}
			selected={col >= selected.left && col <= selected.right}
			resizeTabbable={col === active.left}
			onResize={onColumnResize}
		/>
	);
	const ariaCellId = (row: number, col: number) => {
		const merge = merges.find(
			(range) =>
				row >= range.top &&
				row <= range.bottom &&
				col >= range.left &&
				col <= range.right,
		);
		if (merge && merge.top !== row) return null;
		return `${gridId}-spreadsheet-row-${merge?.top ?? row}-cell-${merge?.left ?? col}`;
	};
	const mergeAnchorRows = Array.from(
		new Set(visibleMerges.map((merge) => merge.top)),
	).filter((row) => !pinnedRows.includes(row) && !scrollRows.includes(row));
	const mergeAnchorRow = (row: number) => (
		<div
			key={row}
			role="row"
			aria-rowindex={row + 2}
			aria-owns={visibleMerges
				.filter((merge) => merge.top === row)
				.map((merge) => ariaCellId(row, merge.left))
				.filter(Boolean)
				.join(" ")}
			className="sr-only"
		>
			<RowHeader
				gridId={gridId}
				row={row}
				top={0}
				width={gutter}
				selected={row >= selected.top && row <= selected.bottom}
			/>
		</div>
	);
	const rowHeader = (row: number, top: number, cols: number[]) => (
		<div
			key={row}
			role="row"
			aria-rowindex={row + 2}
			aria-owns={Array.from(
				new Set(cols.map((col) => ariaCellId(row, col)).filter(Boolean)),
			).join(" ")}
		>
			<RowHeader
				gridId={gridId}
				row={row}
				top={top}
				width={gutter}
				selected={row >= selected.top && row <= selected.bottom}
			/>
		</div>
	);
	const activeCell = getCell(selection.anchor.row, selection.anchor.col);

	return (
		<div className="relative h-full w-full">
			<div
				ref={scrollRef}
				role="grid"
				aria-label={label}
				aria-readonly
				aria-multiselectable
				aria-rowcount={rowCount + 1}
				aria-colcount={colCount + 1}
				tabIndex={0}
				className="group peer relative h-full w-full select-none overflow-auto outline-none"
				onKeyDown={handleKeyDown}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
			>
				<div
					className="relative"
					style={{ width: totalWidth, height: totalHeight }}
				>
					<CellLayer
						{...layer}
						className="z-0"
						region={{
							top: frozenRows,
							left: frozenCols,
							bottom: lastRowIndex,
							right: lastColIndex,
						}}
						rows={scrollRows}
						cols={scrollCols}
						top={stickyTop}
						left={stickyLeft}
					/>
					{mergeAnchorRows.map(mergeAnchorRow)}
					<div
						className="sticky top-0 z-20 flex"
						style={{ width: totalWidth, height: stickyTop }}
					>
						<div
							className="sticky left-0 z-10 h-full shrink-0"
							style={{ width: stickyLeft }}
						>
							<div
								aria-hidden
								className={cn(
									"absolute top-0 left-0 border-border border-r border-b",
									HEADER_SURFACE,
								)}
								style={{ width: gutter, height: HEADER_HEIGHT }}
							/>
							<div role="row" aria-rowindex={1}>
								{pinnedCols.map((col) =>
									columnHeader(col, gutter + (starts[col] ?? 0)),
								)}
							</div>
							{pinnedRows.map((row) =>
								rowHeader(row, HEADER_HEIGHT + row * ROW_HEIGHT, [
									...pinnedCols,
									...scrollCols,
								]),
							)}
							{frozenRows > 0 && frozenCols > 0 && (
								<CellLayer
									{...layer}
									region={{
										top: 0,
										left: 0,
										bottom: frozenRows - 1,
										right: frozenCols - 1,
									}}
									rows={pinnedRows}
									cols={pinnedCols}
									top={HEADER_HEIGHT}
									left={gutter}
								/>
							)}
							{frozenRows > 0 && frozenCols > 0 && (
								<div
									className={cn(FROZEN_EDGE, "w-px")}
									style={{
										top: HEADER_HEIGHT,
										left: stickyLeft - 1,
										height: frozenHeight,
									}}
								/>
							)}
						</div>
						<div
							className="relative h-full shrink-0"
							style={{ width: totalWidth - stickyLeft }}
						>
							<div role="row" aria-rowindex={1}>
								{scrollCols.map((col) =>
									columnHeader(col, (starts[col] ?? 0) - frozenWidth),
								)}
							</div>
							{frozenRows > 0 && (
								<CellLayer
									{...layer}
									region={{
										top: 0,
										left: frozenCols,
										bottom: frozenRows - 1,
										right: lastColIndex,
									}}
									rows={pinnedRows}
									cols={scrollCols}
									top={HEADER_HEIGHT}
									left={0}
								/>
							)}
						</div>
						{frozenRows > 0 && (
							<div
								className={cn(FROZEN_EDGE, "left-0 h-px")}
								style={{ top: stickyTop - 1, width: totalWidth }}
							/>
						)}
					</div>
					<div
						className="sticky left-0 z-10"
						style={{ width: stickyLeft, height: totalHeight - stickyTop }}
					>
						{scrollRows.map((row) =>
							rowHeader(row, (row - frozenRows) * ROW_HEIGHT, [
								...pinnedCols,
								...scrollCols,
							]),
						)}
						{frozenCols > 0 && (
							<CellLayer
								{...layer}
								region={{
									top: frozenRows,
									left: 0,
									bottom: lastRowIndex,
									right: frozenCols - 1,
								}}
								rows={scrollRows}
								cols={pinnedCols}
								top={0}
								left={gutter}
							/>
						)}
						{frozenCols > 0 && (
							<div
								className={cn(FROZEN_EDGE, "top-0 h-full w-px")}
								style={{ left: stickyLeft - 1 }}
							/>
						)}
					</div>
				</div>
			</div>
			<div className="pointer-events-none absolute inset-0 z-30 peer-focus-visible:ring-1 peer-focus-visible:ring-ring peer-focus-visible:ring-inset" />
			<div className="sr-only" aria-live="polite" aria-atomic>
				{isMultiCell ? rangeAddress(selected) : cellAddress(selection.anchor)}{" "}
				{activeCell?.formula ?? activeCell?.text}
			</div>
		</div>
	);
}
