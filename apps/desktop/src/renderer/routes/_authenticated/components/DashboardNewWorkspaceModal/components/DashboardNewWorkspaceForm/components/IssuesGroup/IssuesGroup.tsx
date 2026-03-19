import { getTaskDisplayId } from "@superset/shared/task-display";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import { CommandEmpty, CommandGroup, CommandItem } from "@superset/ui/command";
import { toast } from "@superset/ui/sonner";
import { eq, isNull } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { GoArrowUpRight } from "react-icons/go";
import { HiOutlineUserCircle } from "react-icons/hi2";
import { SiLinear } from "react-icons/si";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { getSlugColumnWidth } from "renderer/lib/slug-width";
import { getTaskBranchCandidates } from "renderer/lib/task-identifiers";
import type { WorkspaceHostTarget } from "renderer/lib/v2-workspace-host";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { useHybridSearch } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/hooks/useHybridSearch";
import { compareTasks } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/utils/sorting";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useDashboardNewWorkspaceDraft } from "../../../../DashboardNewWorkspaceDraftContext";
import { useCreateDashboardWorkspace } from "../../../../hooks/useCreateDashboardWorkspace";

interface IssuesGroupProps {
	projectId: string | null;
	hostTarget: WorkspaceHostTarget;
}

export function IssuesGroup({ projectId, hostTarget }: IssuesGroupProps) {
	const collections = useCollections();
	const navigate = useNavigate();
	const { gateFeature } = usePaywall();
	const { createWorkspace } = useCreateDashboardWorkspace();
	const { draft, closeAndResetDraft, runAsyncAction } =
		useDashboardNewWorkspaceDraft();

	const { data: integrations } = useLiveQuery(
		(q) =>
			q
				.from({
					integrationConnections: collections.integrationConnections,
				})
				.select(({ integrationConnections }) => ({
					...integrationConnections,
				})),
		[collections],
	);

	const isLinearConnected =
		integrations?.some((i) => i.provider === "linear") ?? false;

	const { data } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.innerJoin({ status: collections.taskStatuses }, ({ tasks, status }) =>
					eq(tasks.statusId, status.id),
				)
				.leftJoin({ assignee: collections.users }, ({ tasks, assignee }) =>
					eq(tasks.assigneeId, assignee.id),
				)
				.select(({ tasks, status, assignee }) => ({
					...tasks,
					status,
					assignee: assignee ?? null,
				}))
				.where(({ tasks }) => isNull(tasks.deletedAt)),
		[collections],
	);

	// Check v2Workspaces for existing workspaces by branch
	const { data: v2WorkspacesData } = useLiveQuery(
		(q) =>
			q
				.from({ ws: collections.v2Workspaces })
				.where(({ ws }) => eq(ws.projectId, projectId ?? ""))
				.select(({ ws }) => ({ id: ws.id, branch: ws.branch })),
		[collections, projectId],
	);

	const workspaceByBranch = useMemo(() => {
		const map = new Map<string, string>();
		for (const w of v2WorkspacesData ?? []) {
			map.set(w.branch.toLowerCase(), w.id);
		}
		return map;
	}, [v2WorkspacesData]);

	const tasks = useMemo(() => data ?? [], [data]);
	const sortedTasks = useMemo(() => [...tasks].sort(compareTasks), [tasks]);

	const debouncedQuery = useDebouncedValue(draft.issuesQuery, 150);
	const { search } = useHybridSearch(sortedTasks);

	const visibleTasks = useMemo(() => {
		const query = debouncedQuery.trim();
		if (!query) {
			return sortedTasks.slice(0, 100);
		}
		return search(query)
			.slice(0, 100)
			.map((result) => result.item);
	}, [debouncedQuery, sortedTasks, search]);

	const slugWidth = useMemo(
		() => getSlugColumnWidth(visibleTasks.map((t) => getTaskDisplayId(t))),
		[visibleTasks],
	);

	if (!isLinearConnected) {
		return (
			<div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
				<SiLinear className="size-6 text-muted-foreground" />
				<div className="space-y-1">
					<p className="text-sm font-medium">Connect Linear</p>
					<p className="text-xs text-muted-foreground">
						Sync issues from Linear to create workspaces
					</p>
				</div>
				<Button
					size="sm"
					variant="outline"
					onClick={() => {
						gateFeature(GATED_FEATURES.INTEGRATIONS, () => {
							closeAndResetDraft();
							navigate({ to: "/settings/integrations" });
						});
					}}
				>
					Connect
				</Button>
			</div>
		);
	}

	return (
		<CommandGroup>
			<CommandEmpty>No issues found.</CommandEmpty>
			{visibleTasks.map((task) => (
				<CommandItem
					key={task.id}
					onSelect={() => {
						if (!projectId) {
							toast.error("Select a project first");
							return;
						}
						const taskDisplayId = getTaskDisplayId(task);
						const branchCandidates = getTaskBranchCandidates(task);
						const existingId = branchCandidates
							.map((candidate) => workspaceByBranch.get(candidate))
							.find((candidate): candidate is string => Boolean(candidate));
						if (existingId) {
							closeAndResetDraft();
							navigateToV2Workspace(existingId, navigate);
							return;
						}
						void runAsyncAction(
							createWorkspace({
								projectId,
								name: task.title,
								branch: branchCandidates[0] ?? taskDisplayId.toLowerCase(),
								hostTarget,
							}),
							{
								loading: "Creating workspace...",
								success: "Workspace created",
								error: (err) =>
									err instanceof Error
										? err.message
										: "Failed to create workspace",
							},
						);
					}}
					className="group h-12"
				>
					{getTaskBranchCandidates(task).some((candidate) =>
						workspaceByBranch.has(candidate),
					) ? (
						<GoArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
					) : (
						<StatusIcon
							type={task.status.type as StatusType}
							color={task.status.color}
							progress={task.status.progressPercent ?? undefined}
							className="size-4 shrink-0"
						/>
					)}
					<span
						className="text-muted-foreground shrink-0 text-xs tabular-nums truncate"
						style={{ width: slugWidth }}
					>
						{getTaskDisplayId(task)}
					</span>
					<span className="truncate flex-1">{task.title}</span>
					<span className="shrink-0 group-data-[selected=true]:hidden">
						{task.assignee ? (
							<Avatar
								size="xs"
								fullName={task.assignee.name}
								image={task.assignee.image}
							/>
						) : (
							<HiOutlineUserCircle className="size-5 text-muted-foreground" />
						)}
					</span>
					<span className="text-xs text-muted-foreground shrink-0 hidden group-data-[selected=true]:inline">
						{getTaskBranchCandidates(task).some((candidate) =>
							workspaceByBranch.has(candidate),
						)
							? "Open"
							: "Create"}{" "}
						↵
					</span>
				</CommandItem>
			))}
		</CommandGroup>
	);
}
