import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { cn } from "@superset/ui/utils";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { LuCpu, LuGitBranch } from "react-icons/lu";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	type RecentlyViewedEntry,
	useRecentlyViewed,
} from "renderer/routes/_authenticated/_dashboard/components/NavigationControls/components/HistoryDropdown/hooks/useRecentlyViewed";
import {
	joinTasksWithStatuses,
	TASK_LOOKUP_LIMIT,
} from "renderer/routes/_authenticated/_dashboard/components/NavigationControls/components/HistoryDropdown/utils/joinTasksWithStatuses";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useFrameStackStore } from "../../core/frames";

export function RecentlyViewedFrame() {
	const { i18n } = useLingui();
	const recentEntries = useRecentlyViewed(20);
	const currentPath = useLocation({ select: (loc) => loc.pathname });
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const navigate = useNavigate();

	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	// Projects are fully local — identity comes from the host fan-out.
	const { projects: hostProjects } = useHostProjects();
	const projectData = useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.projectKey,
				name: project.name,
			})),
		[hostProjects],
	);
	const workspaceData = useMemo(() => {
		const projectNamesById = new Map(
			(projectData ?? []).map((p) => [p.id, p.name]),
		);
		// Inner join: drop workspaces whose project isn't synced yet (and
		// project-less session workspaces).
		return hostWorkspaces.flatMap((workspace) => {
			if (workspace.projectId === null) return [];
			const projectName = projectNamesById.get(workspace.projectId);
			if (projectName === undefined) return [];
			return [{ id: workspace.id, projectName, branch: workspace.branch }];
		});
	}, [hostWorkspaces, projectData]);

	const { data: automations = [] } =
		cloudTrpc.automation.list.useQuery(undefined);
	const automationData = useMemo(
		() =>
			automations.map((automation) => ({
				id: automation.id,
				name: automation.name,
			})),
		[automations],
	);

	const { data: taskPage } = cloudTrpc.task.listPage.useQuery({
		limit: TASK_LOOKUP_LIMIT,
	});
	const { data: taskStatuses = [] } =
		cloudTrpc.task.statuses.list.useQuery(undefined);
	const taskData = useMemo(
		() => joinTasksWithStatuses(taskPage?.items ?? [], taskStatuses),
		[taskPage, taskStatuses],
	);

	const filteredEntries = recentEntries.filter((entry) => {
		if (entry.type === "workspace") {
			return (workspaceData ?? []).some((w) => w.id === entry.entityId);
		}
		if (entry.type === "automation") {
			return automationData.some((a) => a.id === entry.entityId);
		}
		return taskData.some(
			(t) => t.id === entry.entityId || t.slug === entry.entityId,
		);
	});

	const navigateTo = (path: string) => {
		void navigate({ to: path });
		setOpen(false);
	};

	return (
		<CommandList>
			<CommandEmpty>
				<Trans>Nothing here yet.</Trans>
			</CommandEmpty>
			<CommandGroup
				heading={i18n._(
					msg({
						message: "Recently Viewed",
					}),
				)}
			>
				{filteredEntries.map((entry) => {
					const isCurrent = entry.path === currentPath;
					if (entry.type === "task") {
						return (
							<TaskRow
								key={entry.path}
								entry={entry}
								isCurrent={isCurrent}
								taskData={taskData}
								onSelect={() => navigateTo(entry.path)}
							/>
						);
					}
					if (entry.type === "workspace") {
						return (
							<WorkspaceRow
								key={entry.path}
								entry={entry}
								isCurrent={isCurrent}
								workspaceData={workspaceData ?? []}
								onSelect={() => navigateTo(entry.path)}
							/>
						);
					}
					return (
						<AutomationRow
							key={entry.path}
							entry={entry}
							isCurrent={isCurrent}
							automationData={automationData}
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
	workspaceData: { id: string; projectName: string; branch: string }[];
}) {
	const { i18n } = useLingui();
	const ws = workspaceData.find((w) => w.id === entry.entityId);
	return (
		<CommandItem
			value={`v2-workspace ${entry.entityId} ${ws?.projectName ?? ""} ${ws?.branch ?? ""}`}
			onSelect={onSelect}
			className={cn("gap-2.5", isCurrent && "bg-accent/50")}
		>
			<span className="text-muted-foreground text-xs shrink-0 w-24 text-left line-clamp-1">
				{ws?.projectName ??
					i18n._(
						msg({
							message: "Workspace",
						}),
					)}
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
				{ws?.branch ??
					i18n._(
						msg({
							message: "Unknown",
						}),
					)}
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
	const { i18n } = useLingui();
	const automation = automationData.find((a) => a.id === entry.entityId);
	return (
		<CommandItem
			value={`automation ${entry.entityId} ${automation?.name ?? ""}`}
			onSelect={onSelect}
			className={cn("gap-2.5", isCurrent && "bg-accent/50")}
		>
			<span className="text-muted-foreground text-xs shrink-0 w-24 text-left line-clamp-1">
				<Trans>Automation</Trans>
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
				{automation?.name ??
					i18n._(
						msg({
							message: "Unknown",
						}),
					)}
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
	const { i18n } = useLingui();
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
				{task?.slug ??
					i18n._(
						msg({
							message: "Task",
						}),
					)}
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
				{task?.title ??
					i18n._(
						msg({
							message: "Unknown",
						}),
					)}
			</span>
		</CommandItem>
	);
}
