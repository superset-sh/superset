import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import { CommandEmpty, CommandGroup, CommandItem } from "@superset/ui/command";
import { toast } from "@superset/ui/sonner";
import { eq, isNull } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { GoArrowUpRight } from "react-icons/go";
import { HiOutlineUserCircle } from "react-icons/hi2";
import { SiLinear } from "react-icons/si";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getSlugColumnWidth } from "renderer/lib/slug-width";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { useHybridSearch } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/hooks/useHybridSearch";
import { compareTasks } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/utils/sorting";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useNewWorkspaceModalDraft } from "../../NewWorkspaceModalDraftContext";

const PAGE_SIZE = 50;

interface IssuesGroupProps {
	projectId: string | null;
}

export function IssuesGroup({ projectId }: IssuesGroupProps) {
	const collections = useCollections();
	const navigate = useNavigate();
	const { gateFeature } = usePaywall();
	const { createWorkspace, draft, closeAndResetDraft, runAsyncAction } =
		useNewWorkspaceModalDraft();

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

	const { data: allWorkspaces = [] } =
		electronTrpc.workspaces.getAll.useQuery();

	const workspaceByBranch = useMemo(() => {
		const map = new Map<string, string>();
		for (const w of allWorkspaces) {
			if (w.projectId === projectId) {
				map.set(w.branch, w.id);
			}
		}
		return map;
	}, [allWorkspaces, projectId]);

	const tasks = useMemo(() => data ?? [], [data]);
	const sortedTasks = useMemo(() => [...tasks].sort(compareTasks), [tasks]);

	const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
	const debouncedQuery = useDebouncedValue(draft.issuesQuery, 150);
	const { search } = useHybridSearch(sortedTasks);

	// Reset pagination when search query changes
	const [prevQuery, setPrevQuery] = useState(debouncedQuery);
	if (prevQuery !== debouncedQuery) {
		setPrevQuery(debouncedQuery);
		setDisplayLimit(PAGE_SIZE);
	}

	const allMatchingTasks = useMemo(() => {
		const query = debouncedQuery.trim();
		if (!query) {
			return sortedTasks;
		}
		return search(query).map((result) => result.item);
	}, [debouncedQuery, sortedTasks, search]);

	const visibleTasks = useMemo(
		() => allMatchingTasks.slice(0, displayLimit),
		[allMatchingTasks, displayLimit],
	);
	const hasMore = allMatchingTasks.length > displayLimit;

	// Infinite scroll: load more when sentinel is visible
	const sentinelRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = sentinelRef.current;
		if (!el || !hasMore) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					setDisplayLimit((prev) => prev + PAGE_SIZE);
				}
			},
			{ threshold: 0 },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [hasMore]);

	const slugWidth = useMemo(
		() => getSlugColumnWidth(visibleTasks.map((t) => t.slug)),
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
						const existingId = workspaceByBranch.get(task.slug.toLowerCase());
						if (existingId) {
							closeAndResetDraft();
							navigateToWorkspace(existingId, navigate);
							return;
						}
						void runAsyncAction(
							createWorkspace.mutateAsync({
								projectId,
								name: task.title,
								branchName: task.slug.toLowerCase(),
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
					{workspaceByBranch.has(task.slug.toLowerCase()) ? (
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
						{task.slug}
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
						{workspaceByBranch.has(task.slug.toLowerCase()) ? "Open" : "Create"}{" "}
						↵
					</span>
				</CommandItem>
			))}
			{hasMore && (
				<div
					ref={sentinelRef}
					className="flex items-center justify-center py-2 text-xs text-muted-foreground"
				/>
			)}
		</CommandGroup>
	);
}
