import type { TaskPriority } from "@superset/db/enums";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { eq, isNull } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { GoArrowUpRight } from "react-icons/go";
import {
	LuChevronDown,
	LuChevronRight,
	LuInbox,
	LuLoader,
} from "react-icons/lu";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { getSlugColumnWidth } from "renderer/lib/slug-width";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { PriorityIcon } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/PriorityIcon";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

const PRIORITY_ORDER: Record<string, number> = {
	urgent: 0,
	high: 1,
	medium: 2,
	low: 3,
	none: 4,
};

export function IssueQueueSection() {
	const [collapsed, setCollapsed] = useState(false);
	const collections = useCollections();
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id;
	const createWorkspace = useCreateWorkspace();
	const [creatingSlug, setCreatingSlug] = useState<string | null>(null);

	const { data: tasksWithStatus, isLoading } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.innerJoin({ status: collections.taskStatuses }, ({ tasks, status }) =>
					eq(tasks.statusId, status.id),
				)
				.leftJoin({ assignee: collections.users }, ({ tasks, assignee }) =>
					eq(tasks.assigneeId, assignee.id),
				)
				.leftJoin({ creator: collections.users }, ({ tasks, creator }) =>
					eq(tasks.creatorId, creator.id),
				)
				.select(({ tasks, status, assignee, creator }) => ({
					...tasks,
					status,
					assignee: assignee ?? null,
					creator: creator ?? null,
				}))
				.where(({ tasks }) => isNull(tasks.deletedAt)),
		[collections],
	);

	const { data: allWorkspaces = [] } =
		electronTrpc.workspaces.getAll.useQuery();

	const workspaceByBranch = useMemo(() => {
		const map = new Map<string, { id: string; projectId: string }>();
		for (const w of allWorkspaces) {
			map.set(w.branch, { id: w.id, projectId: w.projectId });
		}
		return map;
	}, [allWorkspaces]);

	const filteredTasks = useMemo(() => {
		if (!tasksWithStatus || !currentUserId) return [];

		return tasksWithStatus
			.filter(
				(t) =>
					t.assigneeId === currentUserId &&
					t.status.type !== "completed" &&
					t.status.type !== "canceled",
			)
			.sort((a, b) => {
				const pa = PRIORITY_ORDER[a.priority] ?? 4;
				const pb = PRIORITY_ORDER[b.priority] ?? 4;
				if (pa !== pb) return pa - pb;
				return (
					new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
				);
			});
	}, [tasksWithStatus, currentUserId]);

	const slugWidth = useMemo(
		() => getSlugColumnWidth(filteredTasks.map((t) => t.slug)),
		[filteredTasks],
	);

	const handleTaskClick = async (task: (typeof filteredTasks)[0]) => {
		const existing = workspaceByBranch.get(task.slug.toLowerCase());
		if (existing) {
			navigateToWorkspace(existing.id, navigate);
			return;
		}

		// Need a projectId — use the first project from existing workspaces, or fail gracefully
		const firstProjectId = allWorkspaces[0]?.projectId;
		if (!firstProjectId) {
			toast.error("No project found. Create a workspace first.");
			return;
		}

		setCreatingSlug(task.slug);
		try {
			await createWorkspace.mutateAsync({
				projectId: firstProjectId,
				name: task.title,
				branchName: task.slug.toLowerCase(),
			});
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create workspace",
			);
		} finally {
			setCreatingSlug(null);
		}
	};

	const queueCount = filteredTasks.filter(
		(t) => !workspaceByBranch.has(t.slug.toLowerCase()),
	).length;

	return (
		<div className="overflow-hidden">
			<button
				type="button"
				onClick={() => setCollapsed(!collapsed)}
				className={cn(
					"flex w-full items-center gap-1.5 px-3 py-2",
					"text-xs font-medium uppercase tracking-wider text-muted-foreground",
					"hover:bg-accent/30 cursor-pointer transition-colors",
				)}
			>
				{collapsed ? (
					<LuChevronRight className="size-3 shrink-0" />
				) : (
					<LuChevronDown className="size-3 shrink-0" />
				)}
				<LuInbox className="size-3 shrink-0" />
				<span>Issue Queue</span>
				{queueCount > 0 && (
					<span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded-full tabular-nums">
						{queueCount}
					</span>
				)}
			</button>

			{!collapsed && (
				<div className="text-sm">
					{isLoading ? (
						<p className="px-3 py-2 text-muted-foreground">Loading...</p>
					) : filteredTasks.length === 0 ? (
						<p className="px-3 py-2 text-muted-foreground">
							No assigned issues
						</p>
					) : (
						<div className="space-y-px">
							{filteredTasks.map((task) => {
								const hasWorkspace = workspaceByBranch.has(
									task.slug.toLowerCase(),
								);
								const isCreating = creatingSlug === task.slug;
								return (
									<button
										key={task.id}
										type="button"
										onClick={() => handleTaskClick(task)}
										disabled={isCreating}
										className={cn(
											"flex w-full items-start gap-2 px-3 py-1.5 text-left",
											"hover:bg-accent/30 transition-colors group",
											isCreating && "opacity-50",
										)}
									>
										<div className="mt-0.5 shrink-0">
											{isCreating ? (
												<LuLoader className="size-3.5 animate-spin text-muted-foreground" />
											) : hasWorkspace ? (
												<GoArrowUpRight className="size-3.5 text-muted-foreground" />
											) : (
												<StatusIcon
													type={task.status.type as StatusType}
													color={task.status.color}
													progress={task.status.progressPercent ?? undefined}
													className="size-3.5"
												/>
											)}
										</div>
										<div className="flex flex-col gap-0.5 min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span
													className="text-muted-foreground shrink-0 text-xs tabular-nums truncate"
													style={{ width: slugWidth }}
												>
													{task.slug}
												</span>
												<span className="truncate flex-1 text-xs">
													{task.title}
												</span>
												<PriorityIcon
													priority={task.priority as TaskPriority}
													statusType={task.status.type}
													className="size-3 shrink-0"
												/>
											</div>
											<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
												{task.creator && (
													<span className="truncate">{task.creator.name}</span>
												)}
												{task.creator && task.createdAt && (
													<span>&middot;</span>
												)}
												{task.createdAt && (
													<span className="shrink-0">
														{formatRelativeTime(
															new Date(task.createdAt).getTime(),
														)}
													</span>
												)}
											</div>
										</div>
									</button>
								);
							})}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
