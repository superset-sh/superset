import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { GitCompareArrows } from "lucide-react";
import { memo, useMemo } from "react";
import { useRepoDirtyCounts } from "../../hooks/useRepoDirtyCounts";
import { useWorkspaceRepos } from "../../hooks/useWorkspaceRepos";
import { useWorkspaceGitStatus } from "../../providers/WorkspaceGitStatusProvider";
import { changesPillStats } from "./changesPillStats";
import { PRStatusGroup } from "./components/PRStatusGroup";
import { ShipControl } from "./components/ShipControl";
import { usePRFlowState } from "./hooks/usePRFlowState";

interface ChangesControlProps {
	workspaceId: string;
	/** Whether the active tab shows a Changes pane — the face's toggle state. */
	isChangesOpen: boolean;
	/** Close the visible Changes pane, or open/focus one when none shows. */
	onToggleChanges: () => void;
	/** Open or focus the pane showing the linked PR's summary. */
	onOpenPullRequest: (prNumber: number) => void;
}

/**
 * Top-bar Changes control: one bordered button with a single face covering
 * the branch's whole lifecycle. Before a PR exists the face is the diff
 * stats with the ship actions (commit → push → create PR) in the chevron —
 * or the ship action itself once the tree is clean; once a PR exists the
 * face is the PR badge alone. Either face toggles the Changes pane: it
 * closes the one in view and opens or focuses one otherwise, reading as
 * pressed while one shows.
 *
 * Segments hide on their own: stats while status is unknown, the tree is
 * clean, or a PR owns the face; the right side while the flow state is
 * loading or unavailable — no dead placeholder affordances. `divide-x` puts
 * a hairline between whichever segments render, and `empty:hidden` collapses
 * the shell when none do, so the children keep their own null logic.
 */
export const ChangesControl = memo(function ChangesControl({
	workspaceId,
	isChangesOpen,
	onToggleChanges,
	onOpenPullRequest,
}: ChangesControlProps) {
	const { t } = useLingui();
	const status = useWorkspaceGitStatus();
	const { repos, selected, hasMultipleRepos } = useWorkspaceRepos(workspaceId);
	const dirtyCounts = useRepoDirtyCounts({
		workspaceId,
		repos,
		enabled: hasMultipleRepos,
	});
	// The pill describes the selected folder; the rest of the project would
	// otherwise change without a trace anywhere in the top bar.
	const otherFolderChanges = repos.reduce(
		(total, repo) =>
			repo.folder === selected?.folder
				? total
				: total + (dirtyCounts[repo.folder] ?? 0),
		0,
	);
	const { flowState, onRetry } = usePRFlowState(workspaceId);
	const stats = useMemo(
		() => (status.data ? changesPillStats(status.data) : null),
		[status.data],
	);

	const label = isChangesOpen
		? t({
				message: "Close changes",
			})
		: t({
				message: "Open changes",
			});

	const hasPr =
		flowState.kind === "pr-exists" ||
		((flowState.kind === "busy" || flowState.kind === "error") &&
			flowState.pr != null);
	const visibleStats =
		!hasPr && stats != null && stats.fileCount > 0 ? stats : null;
	const showsOtherFolders = !hasPr && otherFolderChanges > 0;

	return (
		<div className="flex h-7 items-stretch divide-x divide-border/60 overflow-hidden rounded-md border border-border/60 bg-muted/30 empty:hidden">
			{(visibleStats || showsOtherFolders) && (
				<button
					type="button"
					onClick={onToggleChanges}
					aria-label={label}
					aria-pressed={isChangesOpen}
					title={label}
					className={cn(
						"flex items-center gap-1 px-2 text-xs text-muted-foreground outline-none transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:bg-accent/60 focus-visible:text-foreground",
						isChangesOpen && "bg-accent/60 text-foreground",
					)}
				>
					<GitCompareArrows className="size-3.5" />
					{visibleStats && visibleStats.additions > 0 && (
						<span className="tabular-nums text-emerald-600 [.dark_&]:text-[#34d399]">
							+{visibleStats.additions}
						</span>
					)}
					{visibleStats && visibleStats.deletions > 0 && (
						<span className="tabular-nums text-red-600 [.dark_&]:text-[#f87171]">
							−{visibleStats.deletions}
						</span>
					)}
					{visibleStats?.additions === 0 && visibleStats.deletions === 0 && (
						<span className="tabular-nums">{visibleStats.fileCount}</span>
					)}
					{showsOtherFolders && (
						<span
							title={t({
								message: `${otherFolderChanges} changed files in other folders`,
							})}
							className="size-1.5 shrink-0 rounded-full bg-amber-500"
						/>
					)}
				</button>
			)}
			{flowState.kind === "no-pr" ? (
				<ShipControl
					workspaceId={workspaceId}
					sync={flowState.sync}
					onRefresh={onRetry}
					compact={visibleStats != null || showsOtherFolders}
				/>
			) : (
				<PRStatusGroup
					state={flowState}
					workspaceId={workspaceId}
					onRefresh={onRetry}
					isChangesOpen={isChangesOpen}
					toggleLabel={label}
					onToggleChanges={onToggleChanges}
					onOpenPullRequest={onOpenPullRequest}
				/>
			)}
		</div>
	);
});
