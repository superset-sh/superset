import { useState, useMemo } from "react";
import type { CellContext } from "@tanstack/react-table";
import type { SelectTask } from "@superset/db/schema";
import { taskPriorityValues, type TaskPriority } from "@superset/db/enums";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Button } from "@superset/ui/button";
import { useCollections } from "renderer/contexts/CollectionsProvider";
import { PRIORITY_COLORS } from "./constants";

interface PriorityCellProps {
	info: CellContext<SelectTask, TaskPriority>;
}

export function PriorityCell({ info }: PriorityCellProps) {
	const collections = useCollections();
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	const task = info.row.original;
	const currentPriority = info.getValue();

	// Filter priorities based on search query
	const filteredPriorities = useMemo(() => {
		const query = searchQuery.toLowerCase();
		return taskPriorityValues.filter((priority: TaskPriority) =>
			priority.toLowerCase().includes(query),
		);
	}, [searchQuery]);

	const handleSelectPriority = async (newPriority: TaskPriority) => {
		if (newPriority === currentPriority) {
			setOpen(false);
			return;
		}

		try {
			await collections.tasks.update(task.id, (draft) => {
				draft.priority = newPriority;
			});
			setOpen(false);
			setSearchQuery("");
		} catch (error) {
			console.error("[PriorityCell] Failed to update priority:", error);
		}
	};

	// Don't render anything if priority is "none"
	if (currentPriority === "none" && !open) {
		return (
			<DropdownMenu open={open} onOpenChange={setOpen}>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className="h-4 w-4 p-0 hover:bg-accent rounded-full opacity-0 group-hover:opacity-100"
					>
						<div className="w-2 h-2 rounded-full bg-muted" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-40">
					<div className="p-2">
						<Input
							placeholder="Search priority..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="h-8"
							autoFocus
						/>
					</div>
					<div className="max-h-64 overflow-y-auto">
						{filteredPriorities.map((priority: TaskPriority) => (
							<DropdownMenuItem
								key={priority}
								onSelect={() => handleSelectPriority(priority)}
								className="flex items-center gap-2"
							>
								<div
									className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[priority]}`}
								/>
								<span className="text-sm capitalize">{priority}</span>
								{priority === currentPriority && (
									<span className="ml-auto text-xs text-muted-foreground">
										✓
									</span>
								)}
							</DropdownMenuItem>
						))}
						{filteredPriorities.length === 0 && (
							<div className="p-2 text-sm text-muted-foreground text-center">
								No priority found
							</div>
						)}
					</div>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-4 w-4 p-0 hover:bg-accent rounded-full"
					title={currentPriority}
				>
					<div
						className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[currentPriority]}`}
					/>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-40">
				<div className="p-2">
					<Input
						placeholder="Search priority..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="h-8"
						autoFocus
					/>
				</div>
				<div className="max-h-64 overflow-y-auto">
					{filteredPriorities.map((priority: TaskPriority) => (
						<DropdownMenuItem
							key={priority}
							onSelect={() => handleSelectPriority(priority)}
							className="flex items-center gap-2"
						>
							<div
								className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[priority]}`}
							/>
							<span className="text-sm capitalize">{priority}</span>
							{priority === currentPriority && (
								<span className="ml-auto text-xs text-muted-foreground">✓</span>
							)}
						</DropdownMenuItem>
					))}
					{filteredPriorities.length === 0 && (
						<div className="p-2 text-sm text-muted-foreground text-center">
							No priority found
						</div>
					)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
