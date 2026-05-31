import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { LuCpu, LuGitBranch, LuHistory } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	type RecentlyViewedEntry,
	useRecentlyViewed,
} from "./hooks/useRecentlyViewed";

function V2WorkspaceRow({
	entry,
	isCurrent,
	v2WorkspaceData,
	onSelect,
}: {
	entry: RecentlyViewedEntry;
	isCurrent: boolean;
	v2WorkspaceData: {
		id: string;
		projectName: string;
		branch: string;
	}[];
	onSelect: () => void;
}) {
	const ws = v2WorkspaceData.find((w) => w.id === entry.entityId);

	return (
		<DropdownMenuItem
			className={cn("gap-2.5", isCurrent && "bg-accent/50")}
			onSelect={onSelect}
		>
			<span className="text-muted-foreground text-xs shrink-0 w-20 text-left line-clamp-1">
				{ws ? ws.projectName : "Workspace"}
			</span>
			<span className="flex items-center justify-center w-4 shrink-0">
				<LuGitBranch
					className="size-3 text-muted-foreground"
					strokeWidth={1.5}
				/>
			</span>
			<span
				className={cn(
					"truncate text-xs font-normal flex-1 min-w-0",
					!ws && "text-muted-foreground",
				)}
			>
				{ws ? ws.branch : "Unknown"}
			</span>
		</DropdownMenuItem>
	);
}

function AutomationRow({
	entry,
	isCurrent,
	automationData,
	onSelect,
}: {
	entry: RecentlyViewedEntry;
	isCurrent: boolean;
	automationData: {
		id: string;
		name: string;
		agentId: string;
	}[];
	onSelect: () => void;
}) {
	const automation = automationData.find((a) => a.id === entry.entityId);
	const presetIcon = usePresetIcon(automation?.agentId ?? "");

	return (
		<DropdownMenuItem
			className={cn("gap-2.5", isCurrent && "bg-accent/50")}
			onSelect={onSelect}
		>
			<span className="text-muted-foreground text-xs shrink-0 w-20 text-left line-clamp-1">
				Automation
			</span>
			<span className="flex items-center justify-center w-4 shrink-0">
				{presetIcon ? (
					<img src={presetIcon} alt="" className="size-3.5 object-contain" />
				) : (
					<LuCpu className="size-3 text-muted-foreground" strokeWidth={1.5} />
				)}
			</span>
			<span
				className={cn(
					"truncate text-xs font-normal flex-1 min-w-0",
					!automation && "text-muted-foreground",
				)}
			>
				{automation ? automation.name : "Unknown"}
			</span>
		</DropdownMenuItem>
	);
}

function TaskRow({
	entry,
	isCurrent,
	taskData,
	onSelect,
}: {
	entry: RecentlyViewedEntry;
	isCurrent: boolean;
	taskData: {
		id: string;
		slug: string;
		title: string;
		statusColor: string;
		statusType: string;
		statusProgress: number | null;
	}[];
	onSelect: () => void;
}) {
	const task = taskData.find(
		(t) => t.id === entry.entityId || t.slug === entry.entityId,
	);

	return (
		<DropdownMenuItem
			className={cn("gap-2.5", isCurrent && "bg-accent/50")}
			onSelect={onSelect}
		>
			{task ? (
				<>
					<span className="text-muted-foreground text-xs shrink-0 w-20 text-left line-clamp-1">
						{task.slug}
					</span>
					<span className="flex items-center justify-center w-4 shrink-0">
						<StatusIcon
							type={task.statusType as StatusType}
							color={task.statusColor}
							progress={task.statusProgress ?? undefined}
							className="size-3.5"
						/>
					</span>
					<span className="truncate text-xs font-normal flex-1 min-w-0">
						{task.title}
					</span>
				</>
			) : (
				<>
					<span className="text-muted-foreground text-xs shrink-0 w-20 text-left line-clamp-1">
						Task
					</span>
					<span className="truncate text-xs font-normal text-muted-foreground flex-1 min-w-0">
						Unknown
					</span>
				</>
			)}
		</DropdownMenuItem>
	);
}

export function HistoryDropdown() {
	const navigate = useNavigate();
	const recentEntries = useRecentlyViewed(20);
	const currentPath = useLocation({ select: (loc) => loc.pathname });
	const collections = useCollections();

	const { data: v2WorkspaceData } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.innerJoin(
					{ projects: collections.v2Projects },
					({ workspaces, projects }) => eq(workspaces.projectId, projects.id),
				)
				.select(({ workspaces, projects }) => ({
					id: workspaces.id,
					projectName: projects.name,
					branch: workspaces.branch,
				})),
		[collections],
	);

	const { data: automationData } = useLiveQuery(
		(q) =>
			q
				.from({ automations: collections.automations })
				.select(({ automations }) => ({
					id: automations.id,
					name: automations.name,
					agentId: automations.agent,
				})),
		[collections],
	);

	const { data: taskData } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.innerJoin({ status: collections.taskStatuses }, ({ tasks, status }) =>
					eq(tasks.statusId, status.id),
				)
				.select(({ tasks, status }) => ({
					id: tasks.id,
					slug: tasks.slug,
					title: tasks.title,
					statusColor: status.color,
					statusType: status.type,
					statusProgress: status.progressPercent,
				})),
		[collections],
	);

	const filteredEntries = recentEntries.filter((entry) => {
		if (entry.type === "workspace") {
			return false;
		}
		if (entry.type === "v2-workspace") {
			return (v2WorkspaceData ?? []).some((w) => w.id === entry.entityId);
		}
		if (entry.type === "automation") {
			return (automationData ?? []).some((a) => a.id === entry.entityId);
		}
		return (taskData ?? []).some(
			(t) => t.id === entry.entityId || t.slug === entry.entityId,
		);
	});

	if (filteredEntries.length === 0) {
		return (
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						disabled
						className="no-drag flex items-center justify-center size-7 rounded-md text-muted-foreground opacity-30"
					>
						<LuHistory className="size-3.5" strokeWidth={1.5} />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">Recently viewed</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<DropdownMenu>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="no-drag flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
						>
							<LuHistory className="size-3.5" strokeWidth={1.5} />
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">Recently viewed</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="start" className="w-80">
				<DropdownMenuLabel>Recently Viewed</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{filteredEntries.map((entry) => {
					if (entry.type === "task") {
						return (
							<TaskRow
								key={entry.path}
								entry={entry}
								isCurrent={entry.path === currentPath}
								taskData={taskData ?? []}
								onSelect={() => navigate({ to: entry.path })}
							/>
						);
					}
					if (entry.type === "v2-workspace") {
						return (
							<V2WorkspaceRow
								key={entry.path}
								entry={entry}
								isCurrent={entry.path === currentPath}
								v2WorkspaceData={v2WorkspaceData ?? []}
								onSelect={() => navigate({ to: entry.path })}
							/>
						);
					}
					if (entry.type === "automation") {
						return (
							<AutomationRow
								key={entry.path}
								entry={entry}
								isCurrent={entry.path === currentPath}
								automationData={automationData ?? []}
								onSelect={() => navigate({ to: entry.path })}
							/>
						);
					}
					return null;
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
