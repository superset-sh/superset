// biome-ignore-all lint/a11y/useSemanticElements: cells are placed absolutely, so ARIA grid roles stand in for table elements
// biome-ignore-all lint/a11y/useFocusableInteractive: the grid is the one tab stop and announces the active cell
import { cn } from "@superset/ui/utils";
import { memo } from "react";
import { ROW_HEIGHT } from "../../../../utils/gridGeometry";
import { HEADER_SURFACE, HEADER_SURFACE_SELECTED } from "../../constants";

interface RowHeaderProps {
	gridId: string;
	row: number;
	top: number;
	width: number;
	selected: boolean;
}

export const RowHeader = memo(function RowHeader({
	gridId,
	row,
	top,
	width,
	selected,
}: RowHeaderProps) {
	return (
		<div
			id={`${gridId}-spreadsheet-row-${row}-header`}
			role="rowheader"
			aria-colindex={1}
			className={cn(
				"absolute left-0 border-border border-r border-b pr-1.5 text-right text-[11px] tabular-nums leading-6",
				selected
					? `${HEADER_SURFACE_SELECTED} text-foreground`
					: `${HEADER_SURFACE} text-muted-foreground`,
			)}
			style={{ top, width, height: ROW_HEIGHT }}
		>
			{row + 1}
		</div>
	);
});
