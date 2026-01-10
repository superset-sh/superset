import { useState, useMemo } from "react";
import type { CellContext } from "@tanstack/react-table";
import type { SelectTask } from "@superset/db/schema";
import { taskStatusEnumValues, type TaskStatus } from "@superset/db/enums";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Button } from "@superset/ui/button";
import { useCollections } from "renderer/contexts/CollectionsProvider";
import { StatusIcon, STATUS_COLORS } from "../../StatusIcon";

interface StatusCellProps {
	info: CellContext<SelectTask, string>;
}

export function StatusCell({ info }: StatusCellProps) {
	const collections = useCollections();
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	const task = info.row.original;
	const currentStatus = info.getValue();

	// Filter statuses based on search query
	const filteredStatuses = useMemo(() => {
		const query = searchQuery.toLowerCase();
		return taskStatusEnumValues.filter((status: TaskStatus) =>
			status.replace("-", " ").toLowerCase().includes(query),
		);
	}, [searchQuery]);

	const handleSelectStatus = async (newStatus: TaskStatus) => {
		if (newStatus === currentStatus) {
			setOpen(false);
			return;
		}

		try {
			await collections.tasks.update(task.id, (draft) => {
				draft.status = newStatus;
			});
			setOpen(false);
			setSearchQuery("");
		} catch (error) {
			console.error("[StatusCell] Failed to update status:", error);
		}
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-6 w-6 p-0 hover:bg-accent"
				>
					<StatusIcon
						type={currentStatus as any}
						color={STATUS_COLORS[currentStatus] || "#8B5CF6"}
					/>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48">
				<div className="p-2">
					<Input
						placeholder="Search status..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="h-8"
						autoFocus
					/>
				</div>
				<div className="max-h-64 overflow-y-auto">
					{filteredStatuses.map((status: TaskStatus) => (
						<DropdownMenuItem
							key={status}
							onSelect={() => handleSelectStatus(status)}
							className="flex items-center gap-2"
						>
							<StatusIcon
								type={status as any}
								color={STATUS_COLORS[status] || "#8B5CF6"}
							/>
							<span className="text-sm capitalize">
								{status.replace("-", " ")}
							</span>
							{status === currentStatus && (
								<span className="ml-auto text-xs text-muted-foreground">✓</span>
							)}
						</DropdownMenuItem>
					))}
					{filteredStatuses.length === 0 && (
						<div className="p-2 text-sm text-muted-foreground text-center">
							No status found
						</div>
					)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
