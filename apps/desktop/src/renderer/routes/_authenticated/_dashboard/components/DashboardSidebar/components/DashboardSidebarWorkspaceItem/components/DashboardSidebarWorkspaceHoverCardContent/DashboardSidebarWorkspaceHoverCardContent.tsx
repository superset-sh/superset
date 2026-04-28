import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { formatDistanceToNow } from "date-fns";
import { FaGithub } from "react-icons/fa";
import {
	LuExternalLink,
	LuGlobe,
	LuPencil,
	LuTriangleAlert,
} from "react-icons/lu";
import type { DiffStats } from "renderer/hooks/host-service/useDiffStats";
import { useHotkeyDisplay } from "renderer/hotkeys";
import type { DashboardSidebarWorkspace } from "../../../../types";
import { ChecksList } from "./components/ChecksList";
import { ChecksSummary } from "./components/ChecksSummary";
import { PullRequestStatusBadge } from "./components/PullRequestStatusBadge";
import { ReviewStatus } from "./components/ReviewStatus";

interface DashboardSidebarWorkspaceHoverCardContentProps {
	workspace: DashboardSidebarWorkspace;
	diffStats: DiffStats | null;
	onEditBranchClick?: (branchName: string) => void;
}

export function DashboardSidebarWorkspaceHoverCardContent({
	workspace,
	diffStats,
	onEditBranchClick,
}: DashboardSidebarWorkspaceHoverCardContentProps) {
	const {
		name,
		branch,
		pullRequest,
		repoUrl,
		branchExistsOnRemote,
		previewUrl,
		needsRebase,
		behindCount,
		createdAt,
	} = workspace;
	const { keys: openPRDisplay } = useHotkeyDisplay("OPEN_PR");
	const hasOpenPRShortcut = !(
		openPRDisplay.length === 1 && openPRDisplay[0] === "Unassigned"
	);
	const hasCustomAlias = !!name && name !== branch;

	const previewButton = previewUrl ? (
		<Button
			variant="outline"
			size="sm"
			className="w-full h-7 text-xs gap-1.5"
			asChild
		>
			<a href={previewUrl} target="_blank" rel="noopener noreferrer">
				<LuGlobe className="size-3" />
				Open Preview
			</a>
		</Button>
	) : null;

	return (
		<div className="space-y-3">
			<div className="space-y-1.5">
				{hasCustomAlias && <div className="text-sm font-medium">{name}</div>}
				<div className="space-y-0.5">
					<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
						Branch
					</span>
					<div className="flex items-center gap-1.5">
						{onEditBranchClick ? (
							<button
								type="button"
								onClick={() => onEditBranchClick(branch)}
								className={`group/branch flex min-w-0 flex-1 items-center gap-1 font-mono break-all text-left hover:text-foreground hover:underline ${hasCustomAlias ? "text-xs" : "text-sm"}`}
								title="Rename branch"
							>
								<span className="break-all">{branch}</span>
								<LuPencil className="size-3 shrink-0 opacity-0 group-hover/branch:opacity-100 transition-opacity" />
							</button>
						) : (
							<code
								className={`font-mono break-all block min-w-0 flex-1 ${hasCustomAlias ? "text-xs" : "text-sm"}`}
							>
								{branch}
							</code>
						)}
						{repoUrl && branchExistsOnRemote && (
							<a
								href={`${repoUrl}/tree/${branch}`}
								target="_blank"
								rel="noopener noreferrer"
								className="shrink-0 text-muted-foreground hover:text-foreground"
								title="Open branch on GitHub"
								onClick={(e) => e.stopPropagation()}
							>
								<LuExternalLink className="size-3" />
							</a>
						)}
					</div>
				</div>
				<span className="text-xs text-muted-foreground block">
					{formatDistanceToNow(createdAt, { addSuffix: true })}
				</span>
			</div>

			{needsRebase && (
				<div className="flex items-center gap-2 text-amber-500 text-xs bg-amber-500/10 px-2 py-1.5 rounded-md">
					<LuTriangleAlert className="size-3.5 shrink-0" />
					<span>
						Behind main by {behindCount ?? "?"} commit
						{behindCount !== 1 && "s"}, needs rebase
					</span>
				</div>
			)}

			{pullRequest ? (
				<div className="pt-2 border-t border-border space-y-2">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-1.5 flex-wrap">
							<span className="text-xs font-medium text-muted-foreground">
								#{pullRequest.number}
							</span>
							<PullRequestStatusBadge state={pullRequest.state} />
							{pullRequest.state === "open" && pullRequest.reviewDecision && (
								<ReviewStatus
									status={pullRequest.reviewDecision}
									requestedReviewers={pullRequest.requestedReviewers}
								/>
							)}
						</div>
						{diffStats && (
							<div className="flex items-center gap-1.5 text-xs font-mono shrink-0">
								<span className="text-emerald-500">+{diffStats.additions}</span>
								<span className="text-destructive-foreground">
									-{diffStats.deletions}
								</span>
							</div>
						)}
					</div>

					<p className="text-xs leading-relaxed line-clamp-2">
						{pullRequest.title}
					</p>

					{pullRequest.state === "open" && (
						<div className="space-y-2 pt-1">
							<div className="flex items-center gap-2 text-xs">
								<ChecksSummary
									checks={pullRequest.checks}
									status={pullRequest.checksStatus}
								/>
							</div>
							{pullRequest.checks.length > 0 && (
								<ChecksList checks={pullRequest.checks} />
							)}
						</div>
					)}

					<Button
						variant="outline"
						size="sm"
						className="w-full mt-1 h-7 text-xs gap-1.5"
						asChild
					>
						<a href={pullRequest.url} target="_blank" rel="noopener noreferrer">
							<FaGithub className="size-3" />
							View on GitHub
							{hasOpenPRShortcut && (
								<KbdGroup className="ml-auto">
									{openPRDisplay.map((key) => (
										<Kbd key={key} className="h-4 min-w-4 text-[10px]">
											{key}
										</Kbd>
									))}
								</KbdGroup>
							)}
						</a>
					</Button>
					{previewButton}
				</div>
			) : repoUrl ? (
				<div className="pt-2 border-t border-border space-y-2">
					<div className="text-xs text-muted-foreground">
						No PR for this branch
					</div>
					{previewButton}
				</div>
			) : previewButton ? (
				<div className="pt-2 border-t border-border">
					<Button
						variant="outline"
						size="sm"
						className="w-full h-7 text-xs gap-1.5"
						asChild
					>
						<a
							href={previewUrl ?? undefined}
							target="_blank"
							rel="noopener noreferrer"
						>
							<LuGlobe className="size-3" />
							Open Preview
						</a>
					</Button>
				</div>
			) : null}
		</div>
	);
}
