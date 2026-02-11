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
import { LuHistory } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	type RecentlyViewedEntry,
	useRecentlyViewed,
} from "./hooks/useRecentlyViewed";

function WorkspaceRow({
	entry,
	isCurrent,
	workspaceData,
	onSelect,
}: {
	entry: RecentlyViewedEntry;
	isCurrent: boolean;
	workspaceData: {
		id: string;
		projectName: string;
		projectColor: string;
		branch: string;
	}[];
	onSelect: () => void;
}) {
	const ws = workspaceData.find((w) => w.id === entry.entityId);

	return (
		<DropdownMenuItem
			className={cn("gap-2.5", isCurrent && "bg-accent/50")}
			onSelect={onSelect}
		>
			{ws ? (
				<>
					<span className="text-muted-foreground text-xs shrink-0 w-20 text-left line-clamp-1">
						Workspace
					</span>
					<span className="flex items-center justify-center w-4 shrink-0">
						<span
							className="size-2 rounded-full"
							style={{ background: ws.projectColor }}
						/>
					</span>
					<span className="truncate text-xs font-normal flex-1 min-w-0">
						{ws.branch}
					</span>
				</>
			) : (
				<>
					<span className="text-muted-foreground text-xs shrink-0 w-20 text-left line-clamp-1">
						Workspace
					</span>
					<span className="truncate text-xs font-normal text-muted-foreground flex-1 min-w-0">
						Unknown
					</span>
				</>
			)}
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

	const { data: groups } = electronTrpc.workspaces.getAllGrouped.useQuery();
	const workspaceData = (groups ?? []).flatMap((group) =>
		group.workspaces.map((ws) => ({
			id: ws.id,
			projectName: group.project.name,
			projectColor: group.project.color,
			branch: ws.branch ?? ws.name,
		})),
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

	if (recentEntries.length === 0) {
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
				{recentEntries.map((entry) =>
					entry.type === "task" ? (
						<TaskRow
							key={entry.path}
							entry={entry}
							isCurrent={entry.path === currentPath}
							taskData={taskData ?? []}
							onSelect={() => navigate({ to: entry.path })}
						/>
					) : (
						<WorkspaceRow
							key={entry.path}
							entry={entry}
							isCurrent={entry.path === currentPath}
							workspaceData={workspaceData}
							onSelect={() => navigate({ to: entry.path })}
						/>
					),
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
