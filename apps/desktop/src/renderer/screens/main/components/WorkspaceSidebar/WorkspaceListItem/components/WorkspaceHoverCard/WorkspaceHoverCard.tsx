import { Button } from "@superset/ui/button";
import { eq, isNull } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useMemo } from "react";
import { FaGithub } from "react-icons/fa";
import {
	LuExternalLink,
	LuLoaderCircle,
	LuSquareKanban,
	LuTriangleAlert,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { usePRStatus } from "renderer/screens/main/hooks";
import { STROKE_WIDTH } from "../../../constants";
import { ChecksList } from "./components/ChecksList";
import { ChecksSummary } from "./components/ChecksSummary";
import { PRStatusBadge } from "./components/PRStatusBadge";
import { ReviewStatus } from "./components/ReviewStatus";

interface WorkspaceHoverCardContentProps {
	workspaceId: string;
	workspaceAlias?: string;
}

export function WorkspaceHoverCardContent({
	workspaceId,
	workspaceAlias,
}: WorkspaceHoverCardContentProps) {
	const navigate = useNavigate();
	const collections = useCollections();

	const { data: worktreeInfo } =
		electronTrpc.workspaces.getWorktreeInfo.useQuery(
			{ workspaceId },
			{ enabled: !!workspaceId },
		);

	const {
		pr,
		repoUrl,
		branchExistsOnRemote,
		isLoading: isLoadingGithub,
	} = usePRStatus({ workspaceId });

	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId },
	);

	const branch = workspace?.worktree?.branch ?? workspace?.branch;

	const { data: linkedTaskData } = useLiveQuery(
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
					branch: tasks.branch,
					statusType: status.type,
					statusColor: status.color,
				}))
				.where(({ tasks }) => isNull(tasks.deletedAt)),
		[collections],
	);

	const linkedTask = useMemo(() => {
		if (!branch || !linkedTaskData) return null;
		return linkedTaskData.find((task) => task.branch === branch) ?? null;
	}, [branch, linkedTaskData]);

	const needsRebase = worktreeInfo?.gitStatus?.needsRebase;

	const worktreeName = worktreeInfo?.worktreeName;
	const hasCustomAlias =
		workspaceAlias && worktreeName && workspaceAlias !== worktreeName;

	return (
		<div className="space-y-3">
			{/* Header: Alias + Worktree name + age */}
			<div className="space-y-1.5">
				{hasCustomAlias && (
					<div className="text-sm font-medium">{workspaceAlias}</div>
				)}
				{worktreeName && (
					<div className="space-y-0.5">
						<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
							Branch
						</span>
						{repoUrl && branchExistsOnRemote ? (
							<a
								href={`${repoUrl}/tree/${worktreeName}`}
								target="_blank"
								rel="noopener noreferrer"
								className={`flex items-center gap-1 font-mono break-all hover:underline ${hasCustomAlias ? "text-xs" : "text-sm"}`}
							>
								{worktreeName}
								<LuExternalLink
									className="size-3 shrink-0"
									strokeWidth={STROKE_WIDTH}
								/>
							</a>
						) : (
							<code
								className={`font-mono break-all block ${hasCustomAlias ? "text-xs" : "text-sm"}`}
							>
								{worktreeName}
							</code>
						)}
					</div>
				)}
				{worktreeInfo?.createdAt && (
					<span className="text-xs text-muted-foreground block">
						{formatDistanceToNow(worktreeInfo.createdAt, { addSuffix: true })}
					</span>
				)}
			</div>

			{/* Linked Task Section */}
			{linkedTask && (
				<button
					type="button"
					onClick={() => navigate({ to: `/tasks/${linkedTask.id}` })}
					className="w-full pt-2 border-t border-border space-y-1 text-left hover:bg-muted/50 -mx-3 px-3 py-2 rounded-md transition-colors"
				>
					<div className="flex items-center gap-1.5">
						<LuSquareKanban
							className="size-3 text-muted-foreground shrink-0"
							strokeWidth={STROKE_WIDTH}
						/>
						<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
							Linked Task
						</span>
					</div>
					<div className="flex items-center gap-2">
						<StatusIcon
							type={(linkedTask.statusType as StatusType) ?? "unstarted"}
							color={linkedTask.statusColor ?? "#6b7280"}
							className="shrink-0"
						/>
						<span className="text-xs text-muted-foreground shrink-0">
							{linkedTask.slug}
						</span>
						<span className="text-xs truncate">{linkedTask.title}</span>
					</div>
				</button>
			)}

			{/* Needs Rebase Warning */}
			{needsRebase && (
				<div className="flex items-center gap-2 text-amber-500 text-xs bg-amber-500/10 px-2 py-1.5 rounded-md">
					<LuTriangleAlert
						className="size-3.5 shrink-0"
						strokeWidth={STROKE_WIDTH}
					/>
					<span>Behind main, needs rebase</span>
				</div>
			)}

			{/* PR Section */}
			{isLoadingGithub ? (
				<div className="flex items-center gap-2 text-muted-foreground pt-2 border-t border-border">
					<LuLoaderCircle
						className="size-3 animate-spin"
						strokeWidth={STROKE_WIDTH}
					/>
					<span className="text-xs">Loading PR...</span>
				</div>
			) : pr ? (
				<div className="pt-2 border-t border-border space-y-2">
					{/* PR Header: Number + Status + Diff Stats */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<span className="text-xs font-medium text-muted-foreground">
								#{pr.number}
							</span>
							<PRStatusBadge state={pr.state} />
						</div>
						<div className="flex items-center gap-1.5 text-xs font-mono">
							<span className="text-emerald-500">+{pr.additions}</span>
							<span className="text-destructive-foreground">
								-{pr.deletions}
							</span>
						</div>
					</div>

					{/* PR Title */}
					<p className="text-xs leading-relaxed line-clamp-2">{pr.title}</p>

					{/* Checks & Review - only for open PRs */}
					{pr.state === "open" && (
						<div className="space-y-2 pt-1">
							<div className="flex items-center gap-2 text-xs">
								<ChecksSummary checks={pr.checks} status={pr.checksStatus} />
								<span className="text-muted-foreground">·</span>
								<ReviewStatus status={pr.reviewDecision} />
							</div>
							{pr.checks.length > 0 && <ChecksList checks={pr.checks} />}
						</div>
					)}

					{/* View on GitHub button */}
					<Button
						variant="outline"
						size="sm"
						className="w-full mt-1 h-7 text-xs gap-1.5"
						asChild
					>
						<a href={pr.url} target="_blank" rel="noopener noreferrer">
							<FaGithub className="size-3" />
							View on GitHub
						</a>
					</Button>
				</div>
			) : repoUrl ? (
				<div className="text-xs text-muted-foreground pt-2 border-t border-border">
					No PR for this branch
				</div>
			) : null}
		</div>
	);
}
