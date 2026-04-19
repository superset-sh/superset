import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useLiveQuery } from "@tanstack/react-db";
import Fuse from "fuse.js";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

const MAX_RESULTS = 20;

interface IssueLinkCommandProps {
	children: ReactNode;
	tooltipLabel: string;
	onSelect: (
		slug: string,
		title: string,
		taskId: string | undefined,
		url?: string,
	) => void;
}

export function IssueLinkCommand({
	children,
	tooltipLabel,
	onSelect,
}: IssueLinkCommandProps) {
	const [open, setOpen] = useState(false);
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
				externalUrl: t.externalUrl,
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

	const handleSelect = (
		slug: string,
		title: string,
		taskId: string | undefined,
		url?: string,
	) => {
		onSelect(slug, title, taskId, url);
		setSearchQuery("");
		setOpen(false);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				if (!next) setSearchQuery("");
				setOpen(next);
			}}
		>
			<Tooltip>
				<PopoverTrigger asChild>
					<TooltipTrigger asChild>{children}</TooltipTrigger>
				</PopoverTrigger>
				<TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
			</Tooltip>
			<PopoverContent
				className="w-80 p-0"
				align="start"
				side="bottom"
				onWheel={(event) => event.stopPropagation()}
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search issues..."
						value={searchQuery}
						onValueChange={setSearchQuery}
					/>
					<CommandList className="max-h-[280px]">
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
											onSelect={() =>
												handleSelect(
													task.slug,
													task.title,
													task.id,
													task.externalUrl ?? undefined,
												)
											}
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
				</Command>
			</PopoverContent>
		</Popover>
	);
}
