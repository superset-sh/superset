import { cn } from "@superset/ui/utils";
import { flexRender, type Table } from "@tanstack/react-table";
import {
	defaultRangeExtractor,
	type Range,
	useVirtualizer,
} from "@tanstack/react-virtual";
import { Fragment, useCallback, useMemo, useRef } from "react";
import type { TaskWithStatus } from "../../hooks/useTasksTable";
import { TaskContextMenu } from "./components/TaskContextMenu";

const ROW_HEIGHT = 36;
const OVERSCAN = 50;

interface TasksTableViewProps {
	table: Table<TaskWithStatus>;
	slugColumnWidth: string;
	onTaskClick: (task: TaskWithStatus) => void;
}

export function TasksTableView({
	table,
	slugColumnWidth,
	onTaskClick,
}: TasksTableViewProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const rows = table.getRowModel().rows;

	// Track which row indices are group headers so we can pin the active one
	const groupHeaderIndices = useMemo(() => {
		const indices: number[] = [];
		for (let i = 0; i < rows.length; i++) {
			if (rows[i].subRows && rows[i].subRows.length > 0) {
				indices.push(i);
			}
		}
		return indices;
	}, [rows]);

	// Always include the active group header in the rendered range so
	// it stays in the DOM (and sticky) even when scrolled far into a group
	const rangeExtractor = useCallback(
		(range: Range) => {
			let activeStickyIndex: number | null = null;
			for (const idx of groupHeaderIndices) {
				if (idx <= range.startIndex) {
					activeStickyIndex = idx;
				} else {
					break;
				}
			}
			const next = defaultRangeExtractor(range);
			if (activeStickyIndex !== null && !next.includes(activeStickyIndex)) {
				next.push(activeStickyIndex);
				next.sort((a, b) => a - b);
			}
			return next;
		},
		[groupHeaderIndices],
	);

	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: OVERSCAN,
		rangeExtractor,
	});

	const virtualItems = virtualizer.getVirtualItems();

	return (
		<div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
			<div style={{ height: virtualizer.getTotalSize() }}>
				{/* Spacer positions items at the correct scroll offset */}
				<div style={{ height: virtualItems[0]?.start ?? 0 }} />

				{virtualItems.map((virtualRow, i) => {
					// When the pinned header is far above the normal window,
					// there's a gap between it and the next item — fill it
					const prevEnd =
						i === 0
							? virtualItems[0].start
							: virtualItems[i - 1].start + ROW_HEIGHT;
					const gap = virtualRow.start - prevEnd;

					const row = rows[virtualRow.index];
					const isGroupHeader = row.subRows && row.subRows.length > 0;

					return (
						<Fragment key={row.id}>
							{gap > 0 && <div style={{ height: gap }} />}
							{isGroupHeader ? (
								<div className="sticky top-0 bg-background z-10 border-b border-border/50">
									{flexRender(
										row.getVisibleCells()[0].column.columnDef.cell,
										row.getVisibleCells()[0].getContext(),
									)}
								</div>
							) : (
								<TaskContextMenu
									task={row.original}
									onDelete={() => {
										console.log("Delete task:", row.original.id);
									}}
								>
									{/* biome-ignore lint/a11y/useSemanticElements: Grid layout requires div, button cannot use grid styling */}
									<div
										role="button"
										tabIndex={0}
										className={cn(
											"grid items-center gap-3 px-4 h-9 cursor-pointer border-b border-border/50 hover:bg-accent/50",
											row.getIsSelected() && "bg-accent/30",
										)}
										style={{
											gridTemplateColumns: `auto auto ${slugColumnWidth} 1fr auto auto`,
										}}
										onClick={() => onTaskClick(row.original)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												onTaskClick(row.original);
											}
										}}
									>
										{row
											.getVisibleCells()
											.slice(1)
											.map((cell) => (
												<div key={cell.id} className="flex items-center">
													{flexRender(
														cell.column.columnDef.cell,
														cell.getContext(),
													)}
												</div>
											))}
									</div>
								</TaskContextMenu>
							)}
						</Fragment>
					);
				})}
			</div>
		</div>
	);
}
