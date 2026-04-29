import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { formatDistanceToNow } from "date-fns";
import { FaGithub } from "react-icons/fa";
import {
	LuExternalLink,
	LuGlobe,
	LuLoaderCircle,
	LuPencil,
	LuTriangleAlert,
} from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { usePRStatus } from "renderer/screens/main/hooks";
import { STROKE_WIDTH } from "../../../constants";
import { ChecksList } from "./components/ChecksList";
import { ChecksSummary } from "./components/ChecksSummary";
import { PRStatusBadge } from "./components/PRStatusBadge";
import { ReviewStatus } from "./components/ReviewStatus";

interface WorkspaceHoverCardContentProps {
	workspaceId: string;
	workspaceAlias?: string;
	diffStats?: { additions: number; deletions: number } | null;
	onEditBranchClick?: (branchName: string) => void;
}

export function WorkspaceHoverCardContent({
	workspaceId,
	workspaceAlias,
	diffStats,
	onEditBranchClick,
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
		previewUrl,
		isLoading: isLoadingGithub,
	} = usePRStatus({ workspaceId, surface: "workspace-hover-card" });

	const { keys: openPRDisplay } = useHotkeyDisplay("OPEN_PR");
	const hasOpenPRShortcut = !(
		openPRDisplay.length === 1 && openPRDisplay[0] === "Unassigned"
	);

	const previewButton = previewUrl ? (
		<Button
			variant="outline"
			size="sm"
			className="w-full h-7 text-xs gap-1.5"
			asChild
		>
			<a href={previewUrl} target="_blank" rel="noopener noreferrer">
				<LuGlobe className="size-3" strokeWidth={STROKE_WIDTH} />
				Open Preview
			</a>
		</Button>
	) : null;

	const diffStatsBadge = diffStats ? (
		<div className="flex items-center gap-1.5 text-xs font-mono shrink-0">
			<span className="text-emerald-500">+{diffStats.additions}</span>
			<span className="text-destructive-foreground">
				-{diffStats.deletions}
			</span>
		</div>
	) : null;

	const needsRebase = worktreeInfo?.gitStatus?.needsRebase;
	const behindCount = worktreeInfo?.gitStatus?.behind;

	const worktreeName = worktreeInfo?.worktreeName;
	const branchName = worktreeInfo?.branchName;
	const hasCustomAlias =
		workspaceAlias && worktreeName && workspaceAlias !== worktreeName;

	return (
		<div className="space-y-3">
			<div className="space-y-1.5">
				{hasCustomAlias && (
					<div className="text-sm font-medium break-words line-clamp-2">
						{workspaceAlias}
					</div>
				)}
				{branchName && (
					<div className="space-y-0.5">
						<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
							Branch
						</span>
						<div className="flex items-center gap-1.5">
							{onEditBranchClick ? (
								<button
									type="button"
									onClick={() => onEditBranchClick(branchName)}
									className={`group/branch flex min-w-0 flex-1 items-center gap-1 font-mono break-all text-left hover:text-foreground hover:underline ${hasCustomAlias ? "text-xs" : "text-sm"}`}
									title="Rename branch"
								>
									<span className="break-all">{branchName}</span>
									<LuPencil
										className="size-3 shrink-0 opacity-0 group-hover/branch:opacity-100 transition-opacity"
										strokeWidth={STROKE_WIDTH}
									/>
								</button>
							) : (
								<code
									className={`font-mono break-all block min-w-0 flex-1 ${hasCustomAlias ? "text-xs" : "text-sm"}`}
								>
									{branchName}
								</code>
							)}
							{repoUrl && branchExistsOnRemote && (
								<a
									href={`${repoUrl}/tree/${branchName}`}
									target="_blank"
									rel="noopener noreferrer"
									className="shrink-0 text-muted-foreground hover:text-foreground"
									title="Open branch on GitHub"
									onClick={(e) => e.stopPropagation()}
								>
									<LuExternalLink
										className="size-3"
										strokeWidth={STROKE_WIDTH}
									/>
								</a>
							)}
						</div>
					</div>
				)}
				{worktreeInfo?.createdAt && (
					<span className="text-xs text-muted-foreground block">
						{formatDistanceToNow(worktreeInfo.createdAt, { addSuffix: true })}
					</span>
				)}
			</div>

			{needsRebase && (
				<div className="flex items-center gap-2 text-amber-500 text-xs bg-amber-500/10 px-2 py-1.5 rounded-md">
					<LuTriangleAlert
						className="size-3.5 shrink-0"
						strokeWidth={STROKE_WIDTH}
					/>
					<span>
						Behind main by {behindCount ?? "?"} commit
						{behindCount !== 1 && "s"}, needs rebase
					</span>
				</div>
			)}

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
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-1.5 flex-wrap">
							<span className="text-xs font-medium text-muted-foreground">
								#{pr.number}
							</span>
							<PRStatusBadge state={pr.state} />
							{pr.state === "open" && (
								<ReviewStatus
									status={pr.reviewDecision}
									requestedReviewers={pr.requestedReviewers}
								/>
							)}
						</div>
						{diffStatsBadge}
					</div>

					<p className="text-xs leading-relaxed line-clamp-2">{pr.title}</p>

					{pr.state === "open" && (
						<div className="space-y-2 pt-1">
							<div className="flex items-center gap-2 text-xs">
								<ChecksSummary checks={pr.checks} status={pr.checksStatus} />
							</div>
							{pr.checks.length > 0 && <ChecksList checks={pr.checks} />}
						</div>
					)}

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
					{previewButton}
				</div>
			) : repoUrl ? (
				<div className="pt-2 border-t border-border space-y-2">
					<div className="flex items-center justify-between gap-2">
						<div className="text-xs text-muted-foreground">
							No PR for this branch
						</div>
						{diffStatsBadge}
					</div>
					{previewButton}
				</div>
			) : diffStatsBadge ? (
				<div className="pt-2 border-t border-border flex items-center justify-end">
					{diffStatsBadge}
				</div>
			) : null}
		</div>
	);
}
