// biome-ignore-all lint/a11y/useSemanticElements: cells are placed absolutely, so ARIA grid roles stand in for table elements
// biome-ignore-all lint/a11y/useFocusableInteractive: the grid is the one tab stop and announces the active cell
import { cn } from "@superset/ui/utils";
import type { CellRange, GridCell } from "../../../../types";
import { HEADER_HEIGHT, ROW_HEIGHT } from "../../../../utils/gridGeometry";
import { ROW_LINES } from "../../constants";
import { type MatchState, SheetCell } from "./components/SheetCell";

export type { MatchState };

interface CellLayerProps {
	/** The cells this layer owns: a pane of the frozen split. */
	region: CellRange;
	rows: number[];
	cols: number[];
	gutter: number;
	starts: number[];
	/** Where the layer sits in its parent, in pixels. */
	top: number;
	left: number;
	merges: CellRange[];
	getCell: (row: number, col: number) => GridCell | null | undefined;
	matchState: (row: number, col: number) => MatchState;
	selection: CellRange | null;
	ariaSelection: CellRange;
	active: CellRange;
	gridId: string;
	className?: string;
}

function intersect(a: CellRange, b: CellRange): CellRange | null {
	const range = {
		top: Math.max(a.top, b.top),
		left: Math.max(a.left, b.left),
		bottom: Math.min(a.bottom, b.bottom),
		right: Math.min(a.right, b.right),
	};
	return range.top <= range.bottom && range.left <= range.right ? range : null;
}

/** One pane of the grid: lines, cells, merges, selection and active cell. */
export function CellLayer({
	region,
	rows,
	cols,
	gutter,
	starts,
	top,
	left,
	merges,
	getCell,
	matchState,
	selection,
	ariaSelection,
	active,
	gridId,
	className,
}: CellLayerProps) {
	const originX = gutter + (starts[region.left] ?? 0);
	const originY = HEADER_HEIGHT + region.top * ROW_HEIGHT;
	const width = (starts[region.right + 1] ?? 0) - (starts[region.left] ?? 0);
	const height = (region.bottom - region.top + 1) * ROW_HEIGHT;
	const rectOf = (range: CellRange) => ({
		top: HEADER_HEIGHT + range.top * ROW_HEIGHT - originY,
		left: gutter + (starts[range.left] ?? 0) - originX,
		width: (starts[range.right + 1] ?? 0) - (starts[range.left] ?? 0),
		height: (range.bottom - range.top + 1) * ROW_HEIGHT,
	});

	const firstRow = rows[0];
	const lastRow = rows.at(-1);
	const firstCol = cols[0];
	const lastCol = cols.at(-1);
	// Clamped to the rendered window so selecting a whole sheet never builds a
	// layer millions of pixels tall.
	const rendered =
		firstRow === undefined ||
		lastRow === undefined ||
		firstCol === undefined ||
		lastCol === undefined
			? null
			: intersect(region, {
					top: firstRow - 1,
					bottom: lastRow + 1,
					left: firstCol - 1,
					right: lastCol + 1,
				});
	const ownMerges = merges
		.map((merge) => ({ merge, part: intersect(merge, region) }))
		.filter(
			(entry): entry is { merge: CellRange; part: CellRange } =>
				entry.part !== null,
		);
	const covered = (row: number, col: number) =>
		ownMerges.some(
			({ part }) =>
				row >= part.top &&
				row <= part.bottom &&
				col >= part.left &&
				col <= part.right,
		);
	const selectionPart =
		selection && rendered ? intersect(selection, rendered) : null;
	const activePart = rendered ? intersect(active, rendered) : null;
	const isSelected = (range: CellRange) =>
		intersect(ariaSelection, range) !== null;

	return (
		<div
			className={cn("absolute bg-background", className)}
			style={{ top, left, width, height, backgroundImage: ROW_LINES }}
		>
			{firstRow !== undefined &&
				cols.map((col) => (
					<div
						key={`line:${col}`}
						aria-hidden
						className="absolute w-px bg-border"
						style={{
							left: gutter + (starts[col + 1] ?? 0) - 1 - originX,
							top: HEADER_HEIGHT + firstRow * ROW_HEIGHT - originY,
							height: rows.length * ROW_HEIGHT,
						}}
					/>
				))}
			{rows.flatMap((row) =>
				cols.map((col) => {
					if (covered(row, col)) return null;
					return (
						<SheetCell
							key={`${row}:${col}`}
							id={`${gridId}-spreadsheet-row-${row}-cell-${col}`}
							ariaColIndex={col + 2}
							selected={isSelected({
								top: row,
								left: col,
								bottom: row,
								right: col,
							})}
							top={HEADER_HEIGHT + row * ROW_HEIGHT - originY}
							left={gutter + (starts[col] ?? 0) - originX}
							width={(starts[col + 1] ?? 0) - (starts[col] ?? 0) - 1}
							height={ROW_HEIGHT - 1}
							cell={getCell(row, col)}
							match={matchState(row, col)}
						/>
					);
				}),
			)}
			{ownMerges.map(({ merge, part }) => {
				const rect = rectOf(part);
				const ownsAnchor = part.top === merge.top && part.left === merge.left;
				return (
					<SheetCell
						key={`merge:${merge.top}:${merge.left}`}
						id={
							ownsAnchor
								? `${gridId}-spreadsheet-row-${merge.top}-cell-${merge.left}`
								: undefined
						}
						ariaColIndex={part.left + 2}
						selected={isSelected(merge)}
						rowSpan={part.bottom - part.top + 1}
						colSpan={part.right - part.left + 1}
						top={rect.top}
						left={rect.left}
						width={rect.width - 1}
						height={rect.height - 1}
						cell={ownsAnchor ? getCell(merge.top, merge.left) : null}
						match={ownsAnchor ? matchState(merge.top, merge.left) : "none"}
						merged
					/>
				);
			})}
			{selectionPart && (
				<div
					aria-hidden
					className="pointer-events-none absolute z-[2] border border-primary/40 bg-primary/10"
					style={rectOf(selectionPart)}
				/>
			)}
			{activePart &&
				(() => {
					const rect = rectOf(activePart);
					return (
						<div
							aria-hidden
							className="pointer-events-none absolute z-[3] border-2 border-muted-foreground/50 group-focus:border-primary"
							style={{
								top: rect.top - 1,
								left: rect.left - 1,
								width: rect.width + 1,
								height: rect.height + 1,
							}}
						/>
					);
				})()}
		</div>
	);
}
