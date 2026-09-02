import { Trans, useLingui } from "@lingui/react/macro";
import { Checkbox } from "@superset/ui/checkbox";
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
import Fuse from "fuse.js";
import type { ReactNode } from "react";
import { useId, useMemo, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { TASK_PICKER_INPUT } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/hooks/useTasksData";

const MAX_RESULTS = 20;

function isClosedStatus(type: StatusType | undefined): boolean {
	return type === "completed" || type === "canceled";
}

interface IssueLinkCommandProps {
	children: ReactNode;
	tooltipLabel: string;
	onSelect: (
		slug: string,
		title: string,
		taskId: string | undefined,
		url?: string,
		branch?: string,
	) => void;
}

export function IssueLinkCommand({
	children,
	tooltipLabel,
	onSelect,
}: IssueLinkCommandProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [showClosed, setShowClosed] = useState(false);
	const showClosedId = useId();

	const { data: taskPage } = cloudTrpc.task.listPage.useQuery(
		TASK_PICKER_INPUT,
		{
			enabled: open,
		},
	);

	const allTasks = useMemo(
		() =>
			(taskPage?.items ?? []).map(({ task }) => ({
				id: task.id,
				slug: task.slug,
				title: task.title,
				statusId: task.statusId,
				priority: task.priority,
				updatedAt: task.updatedAt,
				externalUrl: task.externalUrl,
				branch: task.branch,
			})),
		[taskPage],
	);

	const { data: allStatuses } = cloudTrpc.task.statuses.list.useQuery(
		undefined,
		{ enabled: open },
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
			new Fuse(
				(allTasks ?? []).filter((task) => {
					if (showClosed) return true;
					const status = task.statusId
						? statusMap.get(task.statusId)
						: undefined;
					return !isClosedStatus(status?.type);
				}),
				{
					keys: [
						{ name: "slug", weight: 3 },
						{ name: "title", weight: 2 },
					],
					threshold: 0.4,
					ignoreLocation: true,
				},
			),
		[allTasks, showClosed, statusMap],
	);

	const filteredTasks = useMemo(() => {
		if (!allTasks?.length) return [];
		// An empty status map makes every task read as open, so the open-only
		// list would show closed issues until the statuses land.
		if (!showClosed && !allStatuses) return [];
		const visibleTasks = allTasks.filter((task) => {
			if (showClosed) return true;
			const status = task.statusId ? statusMap.get(task.statusId) : undefined;
			return !isClosedStatus(status?.type);
		});
		if (!searchQuery) {
			return visibleTasks
				.sort(
					(a, b) =>
						new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
				)
				.slice(0, MAX_RESULTS);
		}
		return taskFuse
			.search(searchQuery, { limit: MAX_RESULTS })
			.map((r) => r.item);
	}, [allStatuses, allTasks, searchQuery, showClosed, statusMap, taskFuse]);

	const handleSelect = (
		slug: string,
		title: string,
		taskId: string | undefined,
		url?: string,
		branch?: string,
	) => {
		onSelect(slug, title, taskId, url, branch);
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
				className="w-[440px] p-0"
				align="start"
				side="bottom"
				onWheel={(event) => event.stopPropagation()}
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={t({
							message: "Search issues...",
						})}
						value={searchQuery}
						onValueChange={setSearchQuery}
					/>
					<div className="flex items-center gap-2 border-b px-3 py-2">
						<Checkbox
							id={showClosedId}
							checked={showClosed}
							onCheckedChange={(checked) => setShowClosed(checked === true)}
						/>
						<label
							htmlFor={showClosedId}
							className="cursor-pointer select-none text-xs text-muted-foreground"
						>
							<Trans>Show closed</Trans>
						</label>
					</div>
					<CommandList className="max-h-[420px]">
						{filteredTasks.length === 0 && (
							<CommandEmpty>
								{showClosed ? (
									<Trans>No issues found.</Trans>
								) : (
									<Trans>No open issues found.</Trans>
								)}
							</CommandEmpty>
						)}
						{filteredTasks.length > 0 && (
							<CommandGroup
								heading={
									searchQuery
										? t({
												message: "Results",
											})
										: showClosed
											? t({
													message: "Recent issues",
												})
											: t({
													message: "Open issues",
												})
								}
							>
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
													task.branch ?? undefined,
												)
											}
											className="group items-start gap-3 rounded-md px-2.5 py-2"
										>
											<span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
												{status ? (
													<StatusIcon
														type={status.type}
														color={status.color}
														progress={status.progressPercent ?? undefined}
													/>
												) : (
													<span className="size-3.5 rounded-full border border-muted-foreground/40" />
												)}
											</span>
											<div className="flex min-w-0 flex-1 flex-col gap-0.5">
												<span className="truncate text-sm leading-snug">
													{task.title}
												</span>
												<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
													<span className="font-mono">{task.slug}</span>
													{status ? (
														<>
															<span aria-hidden>·</span>
															<span className="capitalize">{status.type}</span>
														</>
													) : null}
												</span>
											</div>
											<span className="ml-2 hidden shrink-0 self-center text-[11px] text-muted-foreground group-data-[selected=true]:inline">
												↵
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
