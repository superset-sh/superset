import {
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { cn } from "@superset/ui/utils";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { LuCpu, LuGitBranch } from "react-icons/lu";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type RecentlyViewedEntry,
	useRecentlyViewed,
} from "renderer/routes/_authenticated/_dashboard/components/NavigationControls/components/HistoryDropdown/hooks/useRecentlyViewed";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useFrameStackStore } from "../../core/frames";

export function RecentlyViewedFrame() {
	const recentEntries = useRecentlyViewed(20);
	const currentPath = useLocation({ select: (loc) => loc.pathname });
	const collections = useCollections();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const navigate = useNavigate();

	const { data: groups } = electronTrpc.workspaces.getAllGrouped.useQuery();
	const workspaceData = (groups ?? []).flatMap((group) =>
		group.workspaces.map((ws) => ({
			id: ws.id,
			projectName: group.project.name,
			projectColor: group.project.color,
			branch: ws.branch ?? ws.name,
		})),
	);

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
			if (isV2CloudEnabled) return false;
			return workspaceData.some((w) => w.id === entry.entityId);
		}
		if (entry.type === "v2-workspace") {
			if (!isV2CloudEnabled) return false;
			return (v2WorkspaceData ?? []).some((w) => w.id === entry.entityId);
		}
		if (entry.type === "automation") {
			if (!isV2CloudEnabled) return false;
			return (automationData ?? []).some((a) => a.id === entry.entityId);
		}
		return (taskData ?? []).some(
			(t) => t.id === entry.entityId || t.slug === entry.entityId,
		);
	});

	const navigateTo = (path: string) => {
		void navigate({ to: path });
		setOpen(false);
	};

	return (
		<CommandList>
			<CommandEmpty>Nothing here yet.</CommandEmpty>
			<CommandGroup heading="Recently Viewed">
				{filteredEntries.map((entry) => {
					const isCurrent = entry.path === currentPath;
					if (entry.type === "task") {
						return (
							<TaskRow
								key={entry.path}
								entry={entry}
								isCurrent={isCurrent}
								taskData={taskData ?? []}
								onSelect={() => navigateTo(entry.path)}
							/>
						);
					}
					if (entry.type === "v2-workspace") {
						return (
							<V2WorkspaceRow
								key={entry.path}
								entry={entry}
								isCurrent={isCurrent}
								v2WorkspaceData={v2WorkspaceData ?? []}
								onSelect={() => navigateTo(entry.path)}
							/>
						);
					}
					if (entry.type === "automation") {
						return (
							<AutomationRow
								key={entry.path}
								entry={entry}
								isCurrent={isCurrent}
								automationData={automationData ?? []}
								onSelect={() => navigateTo(entry.path)}
							/>
						);
					}
					return (
						<WorkspaceRow
							key={entry.path}
							entry={entry}
							isCurrent={isCurrent}
							workspaceData={workspaceData}
							onSelect={() => navigateTo(entry.path)}
						/>
					);
				})}
			</CommandGroup>
		</CommandList>
	);
}

interface RowProps {
	entry: RecentlyViewedEntry;
	isCurrent: boolean;
	onSelect: () => void;
}

function WorkspaceRow({
	entry,
	isCurrent,
	workspaceData,
	onSelect,
}: RowProps & {
	workspaceData: {
		id: string;
		projectName: string;
		projectColor: string;
		branch: string;
	}[];
}) {
	const ws = workspaceData.find((w) => w.id === entry.entityId);
	return (
		<CommandItem
			value={`workspace ${entry.entityId} ${ws?.projectName ?? ""} ${ws?.branch ?? ""}`}
			onSelect={onSelect}
			className={cn("gap-2.5", isCurrent && "bg-accent/50")}
		>
			<span className="text-muted-foreground text-xs shrink-0 w-24 text-left line-clamp-1">
				{ws?.projectName ?? "Workspace"}
			</span>
			<span className="flex items-center justify-center w-4 shrink-0">
				{ws ? (
					<span
						className="size-2 rounded-full"
						style={{ background: ws.projectColor }}
					/>
				) : null}
			</span>
			<span
				className={cn(
					"truncate text-xs font-normal flex-1 min-w-0",
					!ws && "text-muted-foreground",
				)}
			>
				{ws?.branch ?? "Unknown"}
			</span>
		</CommandItem>
	);
}

function V2WorkspaceRow({
	entry,
	isCurrent,
	v2WorkspaceData,
	onSelect,
}: RowProps & {
	v2WorkspaceData: { id: string; projectName: string; branch: string }[];
}) {
	const ws = v2WorkspaceData.find((w) => w.id === entry.entityId);
	return (
		<CommandItem
			value={`v2-workspace ${entry.entityId} ${ws?.projectName ?? ""} ${ws?.branch ?? ""}`}
			onSelect={onSelect}
			className={cn("gap-2.5", isCurrent && "bg-accent/50")}
		>
			<span className="text-muted-foreground text-xs shrink-0 w-24 text-left line-clamp-1">
				{ws?.projectName ?? "Workspace"}
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
				{ws?.branch ?? "Unknown"}
			</span>
		</CommandItem>
	);
}

function AutomationRow({
	entry,
	isCurrent,
	automationData,
	onSelect,
}: RowProps & {
	automationData: { id: string; name: string }[];
}) {
	const automation = automationData.find((a) => a.id === entry.entityId);
	return (
		<CommandItem
			value={`automation ${entry.entityId} ${automation?.name ?? ""}`}
			onSelect={onSelect}
			className={cn("gap-2.5", isCurrent && "bg-accent/50")}
		>
			<span className="text-muted-foreground text-xs shrink-0 w-24 text-left line-clamp-1">
				Automation
			</span>
			<span className="flex items-center justify-center w-4 shrink-0">
				<LuCpu className="size-3 text-muted-foreground" strokeWidth={1.5} />
			</span>
			<span
				className={cn(
					"truncate text-xs font-normal flex-1 min-w-0",
					!automation && "text-muted-foreground",
				)}
			>
				{automation?.name ?? "Unknown"}
			</span>
		</CommandItem>
	);
}

function TaskRow({
	entry,
	isCurrent,
	taskData,
	onSelect,
}: RowProps & {
	taskData: {
		id: string;
		slug: string;
		title: string;
		statusColor: string;
		statusType: string;
		statusProgress: number | null;
	}[];
}) {
	const task = taskData.find(
		(t) => t.id === entry.entityId || t.slug === entry.entityId,
	);
	return (
		<CommandItem
			value={`task ${entry.entityId} ${task?.slug ?? ""} ${task?.title ?? ""}`}
			onSelect={onSelect}
			className={cn("gap-2.5", isCurrent && "bg-accent/50")}
		>
			<span className="text-muted-foreground text-xs shrink-0 w-24 text-left line-clamp-1">
				{task?.slug ?? "Task"}
			</span>
			<span className="flex items-center justify-center w-4 shrink-0">
				{task ? (
					<StatusIcon
						type={task.statusType as StatusType}
						color={task.statusColor}
						progress={task.statusProgress ?? undefined}
						className="size-3.5"
					/>
				) : null}
			</span>
			<span
				className={cn(
					"truncate text-xs font-normal flex-1 min-w-0",
					!task && "text-muted-foreground",
				)}
			>
				{task?.title ?? "Unknown"}
			</span>
		</CommandItem>
	);
}
