import { useState, useMemo } from "react";
import type { CellContext } from "@tanstack/react-table";
import type { SelectTask } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuCheckboxItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Button } from "@superset/ui/button";
import { Badge } from "@superset/ui/badge";
import { useCollections } from "renderer/contexts/CollectionsProvider";
import { HiPlus } from "react-icons/hi2";

interface LabelsCellProps {
	info: CellContext<SelectTask, string[] | null>;
}

export function LabelsCell({ info }: LabelsCellProps) {
	const collections = useCollections();
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	const task = info.row.original;
	const currentLabels = info.getValue() || [];

	// Lazy load all tasks to get all unique labels
	const { data: allTasks } = useLiveQuery(
		(q) => (open ? q.from({ tasks: collections.tasks }) : null),
		[collections, open],
	);

	// Get all unique labels across all tasks
	const allLabels = useMemo(() => {
		if (!allTasks) return [];
		const labelsSet = new Set<string>();
		for (const t of allTasks) {
			if (t.labels && Array.isArray(t.labels)) {
				for (const label of t.labels) {
					labelsSet.add(label);
				}
			}
		}
		return Array.from(labelsSet).sort();
	}, [allTasks]);

	// Filter labels based on search query
	const filteredLabels = useMemo(() => {
		const query = searchQuery.toLowerCase();
		return allLabels.filter((label) => label.toLowerCase().includes(query));
	}, [searchQuery, allLabels]);

	const handleToggleLabel = async (label: string) => {
		try {
			await collections.tasks.update(task.id, (draft) => {
				if (!draft.labels) {
					draft.labels = [label];
				} else if (draft.labels.includes(label)) {
					draft.labels = draft.labels.filter((l) => l !== label);
				} else {
					draft.labels = [...draft.labels, label];
				}
			});
		} catch (error) {
			console.error("[LabelsCell] Failed to update labels:", error);
		}
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-6 px-2 hover:bg-accent flex-shrink-0"
				>
					{currentLabels.length > 0 ? (
						<div className="flex gap-1">
							{currentLabels.slice(0, 2).map((label) => (
								<Badge key={label} variant="outline" className="text-xs">
									{label}
								</Badge>
							))}
							{currentLabels.length > 2 && (
								<Badge variant="outline" className="text-xs">
									+{currentLabels.length - 2}
								</Badge>
							)}
						</div>
					) : (
						<div className="flex items-center gap-1 text-muted-foreground">
							<HiPlus className="h-3 w-3" />
							<span className="text-xs">Labels</span>
						</div>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				<div className="p-2">
					<Input
						placeholder="Search labels..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="h-8"
						autoFocus
					/>
				</div>
				<DropdownMenuSeparator />
				<div className="max-h-64 overflow-y-auto">
					{filteredLabels.map((label) => (
						<DropdownMenuCheckboxItem
							key={label}
							checked={currentLabels.includes(label)}
							onCheckedChange={() => handleToggleLabel(label)}
							className="text-sm"
						>
							{label}
						</DropdownMenuCheckboxItem>
					))}
					{filteredLabels.length === 0 && (
						<div className="p-2 text-sm text-muted-foreground text-center">
							{searchQuery
								? "No labels found"
								: "No labels yet. Add labels to tasks to see them here."}
						</div>
					)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
