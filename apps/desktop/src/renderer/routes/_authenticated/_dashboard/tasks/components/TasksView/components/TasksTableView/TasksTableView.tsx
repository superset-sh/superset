import { cn } from "@superset/ui/utils";
import { flexRender, type Table } from "@tanstack/react-table";
import type { TaskWithStatus } from "../../hooks/useTasksTable";
import { TaskContextMenu } from "./components/TaskContextMenu";

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
						{/* biome-ignore lint/a11y/useSemanticElements: Grid layout requires div, button cannot use grid styling */}
						<div
							role="button"
							tabIndex={0}
							className={cn(
								"grid items-center gap-3 px-4 h-9 cursor-pointer border-b border-border/50 hover:bg-accent/50",
							)}
							style={{
								gridTemplateColumns: `auto auto ${slugColumnWidth} 1fr auto auto`,
							}}
							onClick={() => onTaskClick(task)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									onTaskClick(task);
								}
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
