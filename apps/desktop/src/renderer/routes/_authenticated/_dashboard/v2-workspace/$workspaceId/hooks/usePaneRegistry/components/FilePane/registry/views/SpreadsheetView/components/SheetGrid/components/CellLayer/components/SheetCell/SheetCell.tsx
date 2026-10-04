// biome-ignore-all lint/a11y/useSemanticElements: cells are placed absolutely, so ARIA grid roles stand in for table elements
// biome-ignore-all lint/a11y/useFocusableInteractive: the grid is the one tab stop and announces the active cell
import { cn } from "@superset/ui/utils";
import { memo } from "react";
import type { GridCell } from "../../../../../../types";

export type MatchState = "none" | "match" | "active";

interface SheetCellProps {
	/** 1-based, counting the row header column. */
	id?: string;
	ariaColIndex: number;
	selected: boolean;
	rowSpan?: number;
	colSpan?: number;
	top: number;
	left: number;
	width: number;
	height: number;
	cell: GridCell | null | undefined;
	match: MatchState;
	merged?: boolean;
}

const ALIGN: Record<GridCell["kind"], string> = {
	text: "text-left",
	number: "text-right tabular-nums",
	boolean: "text-center",
	error: "text-center text-destructive",
};

export const SheetCell = memo(function SheetCell({
	id,
	ariaColIndex,
	selected,
	rowSpan,
	colSpan,
	top,
	left,
	width,
	height,
	cell,
	match,
	merged = false,
}: SheetCellProps) {
	return (
		<div
			id={id}
			role="gridcell"
			aria-colindex={ariaColIndex}
			aria-selected={selected}
			aria-rowspan={rowSpan}
			aria-colspan={colSpan}
			className={cn(
				"absolute truncate whitespace-nowrap px-1.5 text-xs leading-[23px]",
				merged && "z-[1] flex items-center bg-background",
				cell ? ALIGN[cell.kind] : undefined,
			)}
			style={{
				top,
				left,
				width,
				height,
				background:
					match === "active"
						? "var(--highlight-active)"
						: match === "match"
							? "var(--highlight-match)"
							: undefined,
			}}
		>
			{merged ? (
				<span className="w-full truncate">{cell?.text}</span>
			) : (
				cell?.text
			)}
		</div>
	);
});
