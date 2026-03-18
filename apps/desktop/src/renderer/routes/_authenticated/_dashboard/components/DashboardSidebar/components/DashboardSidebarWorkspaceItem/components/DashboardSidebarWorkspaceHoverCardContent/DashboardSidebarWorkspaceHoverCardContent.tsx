import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { formatDistanceToNow } from "date-fns";
import { FaGithub } from "react-icons/fa";
import { LuExternalLink, LuGlobe, LuTriangleAlert } from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/stores/hotkeys";
import type { DashboardSidebarWorkspace } from "../../../../types";
import type { WorkspaceRowMockData } from "../../utils";
import { ChecksList } from "./components/ChecksList";
import { ChecksSummary } from "./components/ChecksSummary";
import { PullRequestStatusBadge } from "./components/PullRequestStatusBadge";
import { ReviewStatus } from "./components/ReviewStatus";

interface DashboardSidebarWorkspaceHoverCardContentProps {
	workspace: DashboardSidebarWorkspace;
	mockData: WorkspaceRowMockData;
}

export function DashboardSidebarWorkspaceHoverCardContent({
	workspace,
	mockData,
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
	const openPRDisplay = useHotkeyDisplay("OPEN_PR");
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
					{repoUrl && branchExistsOnRemote ? (
						<a
							href={`${repoUrl}/tree/${branch}`}
							target="_blank"
							rel="noopener noreferrer"
							className={`flex items-center gap-1 font-mono break-all hover:underline ${hasCustomAlias ? "text-xs" : "text-sm"}`}
						>
							{branch}
							<LuExternalLink className="size-3 shrink-0" />
						</a>
					) : (
						<code
							className={`font-mono break-all block ${hasCustomAlias ? "text-xs" : "text-sm"}`}
						>
							{branch}
						</code>
					)}
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
						<div className="flex items-center gap-1.5 text-xs font-mono shrink-0">
							<span className="text-emerald-500">
								+{mockData.diffStats.additions}
							</span>
							<span className="text-destructive-foreground">
								-{mockData.diffStats.deletions}
							</span>
						</div>
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
