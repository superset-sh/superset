import { flexRender, type Table } from "@tanstack/react-table";
import type { TaskWithStatus } from "../../hooks/useTasksTable";
import { TaskContextMenu } from "./components/TaskContextMenu";

interface TasksTableViewProps {
	table: Table<TaskWithStatus>;
	slugColumnWidth: string;
}

export function TasksTableView({
	table,
	slugColumnWidth,
}: TasksTableViewProps) {
	return (
		<div className="flex flex-col">
			{table.getRowModel().rows.map((row) => {
				const isGroupHeader = row.subRows && row.subRows.length > 0;

				if (isGroupHeader) {
					const firstCell = row.getVisibleCells()[0];

					return (
						<div
							key={row.id}
							className="sticky top-0 bg-background z-10 border-b border-border/50"
						>
							{flexRender(
								firstCell.column.columnDef.cell,
								firstCell.getContext(),
							)}
						</div>
					);
				}

				const cells = row.getVisibleCells();
				const task = row.original;

				return (
					<TaskContextMenu
						key={row.id}
						task={task}
						onDelete={() => {
							console.log("Delete task:", task.id);
						}}
					>
						<div
							className="grid items-center gap-3 px-4 h-9 hover:bg-accent/50 cursor-pointer border-b border-border/50"
							style={{
								gridTemplateColumns: `auto auto ${slugColumnWidth} 1fr auto auto`,
							}}
						>
							{cells.slice(1).map((cell) => (
								<div key={cell.id} className="flex items-center">
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</div>
							))}
						</div>
					</TaskContextMenu>
				);
			})}
		</div>
	);
}
