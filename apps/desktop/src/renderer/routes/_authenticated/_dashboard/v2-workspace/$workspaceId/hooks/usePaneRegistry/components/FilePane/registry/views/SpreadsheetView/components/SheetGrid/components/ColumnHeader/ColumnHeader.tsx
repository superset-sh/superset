// biome-ignore-all lint/a11y/useSemanticElements: cells are placed absolutely, so ARIA grid roles stand in for table elements
// biome-ignore-all lint/a11y/useFocusableInteractive: the grid is the one tab stop and announces the active cell
import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { memo, useRef } from "react";
import { columnName, MIN_COLUMN_WIDTH } from "../../../../utils/gridGeometry";
import { HEADER_SURFACE, HEADER_SURFACE_SELECTED } from "../../constants";

const KEYBOARD_STEP = 8;

interface ColumnHeaderProps {
	col: number;
	left: number;
	width: number;
	selected: boolean;
	/** The resize handle of one column only is in the tab order. */
	resizeTabbable: boolean;
	onResize: (col: number, width: number | null) => void;
}

export const ColumnHeader = memo(function ColumnHeader({
	col,
	left,
	width,
	selected,
	resizeTabbable,
	onResize,
}: ColumnHeaderProps) {
	const { t } = useLingui();
	const drag = useRef<{ startX: number; startWidth: number } | null>(null);
	const name = columnName(col);

	return (
		<div
			role="columnheader"
			aria-colindex={col + 2}
			className={cn(
				"absolute top-0 h-full select-none border-border border-r border-b text-center text-[11px] leading-6",
				selected
					? `${HEADER_SURFACE_SELECTED} text-foreground`
					: `${HEADER_SURFACE} text-muted-foreground`,
			)}
			style={{ left, width }}
		>
			{name}
			<div
				role="separator"
				aria-orientation="vertical"
				aria-label={t`Resize column ${name}`}
				aria-valuenow={Math.round(width)}
				aria-valuemin={MIN_COLUMN_WIDTH}
				tabIndex={resizeTabbable ? 0 : -1}
				className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize outline-none hover:bg-primary/40 focus-visible:bg-primary/40"
				onKeyDown={(event) => {
					if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
					event.preventDefault();
					event.stopPropagation();
					const step =
						event.key === "ArrowLeft" ? -KEYBOARD_STEP : KEYBOARD_STEP;
					onResize(col, Math.max(MIN_COLUMN_WIDTH, width + step));
				}}
				onPointerDown={(event) => {
					event.stopPropagation();
					event.preventDefault();
					event.currentTarget.setPointerCapture(event.pointerId);
					drag.current = { startX: event.clientX, startWidth: width };
				}}
				onPointerMove={(event) => {
					if (!drag.current) return;
					onResize(
						col,
						Math.max(
							MIN_COLUMN_WIDTH,
							drag.current.startWidth + event.clientX - drag.current.startX,
						),
					);
				}}
				onPointerUp={() => {
					drag.current = null;
				}}
				onDoubleClick={() => onResize(col, null)}
			/>
		</div>
	);
});
