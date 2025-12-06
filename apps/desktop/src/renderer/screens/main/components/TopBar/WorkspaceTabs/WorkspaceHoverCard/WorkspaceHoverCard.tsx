import { Button } from "@superset/ui/button";
import { formatDistanceToNow } from "date-fns";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { FaGithub } from "react-icons/fa";
import { trpc } from "renderer/lib/trpc";
import { ChecksList } from "./components/ChecksList";
import { ChecksSummary } from "./components/ChecksSummary";
import { PRStatusBadge } from "./components/PRStatusBadge";
import { ReviewStatus } from "./components/ReviewStatus";

interface WorkspaceHoverCardContentProps {
	workspaceId: string;
}

export function WorkspaceHoverCardContent({
	workspaceId,
}: WorkspaceHoverCardContentProps) {
	const { data: worktreeInfo } = trpc.workspaces.getWorktreeInfo.useQuery(
		{ workspaceId },
		{ enabled: !!workspaceId },
	);

	const { data: githubStatus, isLoading: isLoadingGithub } =
		trpc.workspaces.getGitHubStatus.useQuery(
			{ workspaceId },
			{ enabled: !!workspaceId },
		);

	const pr = githubStatus?.pr;
	const needsRebase = worktreeInfo?.gitStatus?.needsRebase;

	return (
		<div className="space-y-3">
			{/* Header: Worktree name + age */}
			{worktreeInfo?.worktreeName && (
				<div className="flex items-center justify-between gap-3">
					<code className="text-sm font-medium font-mono truncate">
						{worktreeInfo.worktreeName}
					</code>
					{worktreeInfo?.createdAt && (
						<span className="text-xs text-muted-foreground whitespace-nowrap">
							{formatDistanceToNow(worktreeInfo.createdAt, { addSuffix: true })}
						</span>
					)}
				</div>
			)}

			{/* Needs Rebase Warning */}
			{needsRebase && (
				<div className="flex items-center gap-2 text-amber-500 text-xs bg-amber-500/10 px-2 py-1.5 rounded-md">
					<TriangleAlert className="size-3.5 shrink-0" />
					<span>Behind main, needs rebase</span>
				</div>
			)}

			{/* PR Section */}
			{isLoadingGithub ? (
				<div className="flex items-center gap-2 text-muted-foreground pt-2 border-t border-border">
					<LoaderCircle className="size-3 animate-spin" />
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
			) : githubStatus ? (
				<div className="text-xs text-muted-foreground pt-2 border-t border-border">
					No PR for this branch
				</div>
			) : null}
		</div>
	);
}
