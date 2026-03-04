import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { useLiveQuery } from "@tanstack/react-db";
import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

const MAX_RESULTS = 20;

interface IssueLinkCommandProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (slug: string) => void;
}

export function IssueLinkCommand({
	open,
	onOpenChange,
	onSelect,
}: IssueLinkCommandProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const collections = useCollections();

	const { data: allTasks } = useLiveQuery(
		(q) =>
			q.from({ t: collections.tasks }).select(({ t }) => ({
				id: t.id,
				slug: t.slug,
				title: t.title,
				statusId: t.statusId,
				priority: t.priority,
				updatedAt: t.updatedAt,
			})),
		[collections.tasks],
	);

	const { data: allStatuses } = useLiveQuery(
		(q) =>
			q.from({ s: collections.taskStatuses }).select(({ s }) => ({
				id: s.id,
				type: s.type,
				color: s.color,
				progressPercent: s.progressPercent,
			})),
		[collections.taskStatuses],
	);

	const statusMap = useMemo(() => {
		const map = new Map<
			string,
			{ type: StatusType; color: string; progressPercent: number | null }
		>();
		for (const s of allStatuses ?? []) {
			map.set(s.id, {
				type: s.type as StatusType,
				color: s.color,
				progressPercent: s.progressPercent,
			});
		}
		return map;
	}, [allStatuses]);

	const taskFuse = useMemo(
		() =>
			new Fuse(allTasks ?? [], {
				keys: [
					{ name: "slug", weight: 3 },
					{ name: "title", weight: 2 },
				],
				threshold: 0.4,
				ignoreLocation: true,
			}),
		[allTasks],
	);

	const filteredTasks = useMemo(() => {
		if (!allTasks?.length) return [];
		if (!searchQuery) {
			return [...allTasks]
				.sort(
					(a, b) =>
						new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
				)
				.slice(0, MAX_RESULTS);
		}
		return taskFuse
			.search(searchQuery, { limit: MAX_RESULTS })
			.map((r) => r.item);
	}, [allTasks, searchQuery, taskFuse]);

	const handleSelect = (slug: string) => {
		onSelect(slug);
		onOpenChange(false);
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) setSearchQuery("");
		onOpenChange(nextOpen);
	};

	return (
		<CommandDialog
			open={open}
			onOpenChange={handleOpenChange}
			title="Link issue"
			description="Search for an issue to link"
			showCloseButton={false}
		>
			<CommandInput
				placeholder="Search issues..."
				value={searchQuery}
				onValueChange={setSearchQuery}
			/>
			<CommandList>
				{filteredTasks.length === 0 && (
					<CommandEmpty>No issues found.</CommandEmpty>
				)}
				{filteredTasks.length > 0 && (
					<CommandGroup heading={searchQuery ? "Results" : "Recent issues"}>
						{filteredTasks.map((task) => {
							const status = task.statusId
								? statusMap.get(task.statusId)
								: undefined;
							return (
								<CommandItem
									key={task.id}
									value={task.slug}
									onSelect={() => handleSelect(task.slug)}
									className="group"
								>
									{status ? (
										<StatusIcon
											type={status.type}
											color={status.color}
											progress={status.progressPercent ?? undefined}
										/>
									) : (
										<span className="size-3.5 shrink-0 rounded-full border border-muted-foreground/40" />
									)}
									<span className="max-w-24 shrink-0 truncate font-mono text-xs text-muted-foreground">
										{task.slug}
									</span>
									<span className="min-w-0 flex-1 truncate text-xs">
										{task.title}
									</span>
									<span className="shrink-0 hidden text-xs text-muted-foreground group-data-[selected=true]:inline">
										Link ↵
									</span>
								</CommandItem>
							);
						})}
					</CommandGroup>
				)}
			</CommandList>
		</CommandDialog>
	);
}
