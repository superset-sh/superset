import { useState, useMemo } from "react";
import type { SelectTask, SelectTaskStatus } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Button } from "@superset/ui/button";
import { useCollections } from "renderer/contexts/CollectionsProvider";
import { StatusIcon } from "../../StatusIcon";

// Task with joined status data
type TaskWithStatus = SelectTask & {
	status: SelectTaskStatus;
};

interface StatusCellProps {
	taskWithStatus: TaskWithStatus;
}

export function StatusCell({ taskWithStatus }: StatusCellProps) {
	const collections = useCollections();
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	// Lazy load statuses only when dropdown opens
	const { data: allStatuses } = useLiveQuery(
		(q) => (open ? q.from({ taskStatuses: collections.taskStatuses }) : null),
		[collections, open],
	);

	const statuses = useMemo(() => allStatuses || [], [allStatuses]);
	const currentStatus = taskWithStatus.status;

	// Filter statuses based on search query
	const filteredStatuses = useMemo(() => {
		const query = searchQuery.toLowerCase();
		return statuses.filter((status) =>
			status.name.toLowerCase().includes(query),
		);
	}, [searchQuery, statuses]);

	const handleSelectStatus = async (newStatus: SelectTaskStatus) => {
		if (newStatus.id === currentStatus.id) {
			setOpen(false);
			return;
		}

		try {
			await collections.tasks.update(taskWithStatus.id, (draft) => {
				draft.statusId = newStatus.id;
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
						type={currentStatus.type as any}
						color={currentStatus.color}
						progress={currentStatus.progressPercent ?? undefined}
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
					{filteredStatuses.map((status) => (
						<DropdownMenuItem
							key={status.id}
							onSelect={() => handleSelectStatus(status)}
							className="flex items-center gap-2"
						>
							<StatusIcon
								type={status.type as any}
								color={status.color}
								progress={status.progressPercent ?? undefined}
							/>
							<span className="text-sm">{status.name}</span>
							{status.id === currentStatus.id && (
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
