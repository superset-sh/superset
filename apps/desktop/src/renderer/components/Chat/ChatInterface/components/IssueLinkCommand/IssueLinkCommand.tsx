import { getTaskDisplayId } from "@superset/shared/task-display";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import { useLiveQuery } from "@tanstack/react-db";
import Fuse from "fuse.js";
import type React from "react";
import type { RefObject } from "react";
import { useMemo, useState } from "react";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

const MAX_RESULTS = 20;

type IssueLinkCommandProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (slug: string, title: string) => void;
} & (
	| { variant?: "dialog" }
	| { variant: "popover"; anchorRef: RefObject<HTMLElement | null> }
);

export function IssueLinkCommand(props: IssueLinkCommandProps) {
	const { open, onOpenChange, onSelect } = props;
	const [searchQuery, setSearchQuery] = useState("");
	const collections = useCollections();

	const { data: allTasks } = useLiveQuery(
		(q) =>
			q.from({ t: collections.tasks }).select(({ t }) => ({
				id: t.id,
				slug: t.slug,
				externalKey: t.externalKey,
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
					{ name: "externalKey", weight: 3 },
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

	const handleClose = () => {
		setSearchQuery("");
		onOpenChange(false);
	};

	const handleSelect = (slug: string, title: string) => {
		onSelect(slug, title);
		handleClose();
	};

	const issueListContent = (
		<>
			<CommandInput
				placeholder="Search issues..."
				value={searchQuery}
				onValueChange={setSearchQuery}
			/>
			<CommandList
				className={props.variant === "popover" ? "max-h-[280px]" : undefined}
			>
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
									onSelect={() => handleSelect(task.slug, task.title)}
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
										{getTaskDisplayId(task)}
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
		</>
	);

	if (props.variant === "popover") {
		return (
			<Popover open={open}>
				<PopoverAnchor
					virtualRef={props.anchorRef as React.RefObject<Element>}
				/>
				<PopoverContent
					className="w-80 p-0"
					align="end"
					side="top"
					onWheel={(event) => event.stopPropagation()}
					onPointerDownOutside={handleClose}
					onEscapeKeyDown={handleClose}
					onFocusOutside={(e) => e.preventDefault()}
				>
					<Command shouldFilter={false}>{issueListContent}</Command>
				</PopoverContent>
			</Popover>
		);
	}

	return (
		<CommandDialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) setSearchQuery("");
				onOpenChange(nextOpen);
			}}
			modal
			title="Link issue"
			description="Search for an issue to link"
			showCloseButton={false}
		>
			{issueListContent}
		</CommandDialog>
	);
}
