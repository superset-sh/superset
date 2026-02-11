import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { formatDistanceToNow } from "date-fns";
import { FaGithub } from "react-icons/fa";
import {
	LuExternalLink,
	LuLoaderCircle,
	LuTriangleAlert,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { usePRStatus } from "renderer/screens/main/hooks";
import { useHotkeyDisplay } from "renderer/stores/hotkeys";
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

	const openPRDisplay = useHotkeyDisplay("OPEN_PR");
	const hasOpenPRShortcut = !(
		openPRDisplay.length === 1 && openPRDisplay[0] === "Unassigned"
	);

	const needsRebase = worktreeInfo?.gitStatus?.needsRebase;

	const worktreeName = worktreeInfo?.worktreeName;
	const branchName = worktreeInfo?.branchName;
	const hasCustomAlias =
		workspaceAlias && worktreeName && workspaceAlias !== worktreeName;

	return (
		<div className="space-y-3">
			{/* Header: Alias + Worktree name + age */}
			<div className="space-y-1.5">
				{hasCustomAlias && (
					<div className="text-sm font-medium">{workspaceAlias}</div>
				)}
				{branchName && (
					<div className="space-y-0.5">
						<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
							Branch
						</span>
						{repoUrl && branchExistsOnRemote ? (
							<a
								href={`${repoUrl}/tree/${branchName}`}
								target="_blank"
								rel="noopener noreferrer"
								className={`flex items-center gap-1 font-mono break-all hover:underline ${hasCustomAlias ? "text-xs" : "text-sm"}`}
							>
								{branchName}
								<LuExternalLink
									className="size-3 shrink-0"
									strokeWidth={STROKE_WIDTH}
								/>
							</a>
						) : (
							<code
								className={`font-mono break-all block ${hasCustomAlias ? "text-xs" : "text-sm"}`}
							>
								{branchName}
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
				</div>
			) : repoUrl ? (
				<div className="text-xs text-muted-foreground pt-2 border-t border-border">
					No PR for this branch
				</div>
			) : null}
		</div>
	);
}
