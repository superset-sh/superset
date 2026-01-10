import { flexRender, type Table } from "@tanstack/react-table";
import type { SelectTask } from "@superset/db/schema";

interface TasksTableViewProps {
	table: Table<SelectTask>;
}

export function TasksTableView({ table }: TasksTableViewProps) {
	return (
		<div className="flex flex-col">
			{table.getRowModel().rows.map((row) => {
				// Group header rows have subRows, leaf rows don't
				const isGroupHeader = row.subRows && row.subRows.length > 0;

				if (isGroupHeader) {
					// Group header - only render the status column (first cell)
					// All other cells return null because they're placeholders
					const firstCell = row.getVisibleCells()[0];
					return (
						<div
							key={row.id}
							className="sticky top-0 z-10 bg-background border-b border-border"
						>
							{flexRender(firstCell.column.columnDef.cell, firstCell.getContext())}
						</div>
					);
				}

				// Leaf row - render all cells horizontally
				// Layout: [ID] [Status Icon + Title .............. | Priority Assignee Labels Due]
				// Note: Status column (index 0) returns null for leaf rows, so we skip it
				const cells = row.getVisibleCells();
				return (
					<div
						key={row.id}
						className="flex items-center gap-2 px-4 py-2 hover:bg-accent/50 cursor-pointer border-b border-border/50"
					>
						{/* Left side: ID + Title (with inline status) - skip null status column */}
						{cells.slice(1, 3).map((cell) => (
							<div key={cell.id}>
								{flexRender(cell.column.columnDef.cell, cell.getContext())}
							</div>
						))}
						{/* Right side metadata: Priority, Assignee, Labels, Due */}
						<div className="flex items-center gap-2 flex-shrink-0">
							{cells.slice(3).map((cell) => (
								<div key={cell.id}>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</div>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}
