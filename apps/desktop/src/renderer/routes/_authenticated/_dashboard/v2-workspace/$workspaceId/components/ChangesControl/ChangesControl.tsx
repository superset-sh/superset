import { useLingui } from "@lingui/react/macro";
import { GitCompareArrows } from "lucide-react";
import { memo, useMemo } from "react";
import { useWorkspaceGitStatus } from "../../providers/WorkspaceGitStatusProvider";
import { changesPillStats } from "./changesPillStats";
import { PRStatusGroup } from "./components/PRStatusGroup";
import { ShipControl } from "./components/ShipControl";
import { usePRFlowState } from "./hooks/usePRFlowState";

interface ChangesControlProps {
	workspaceId: string;
	onOpenChanges: () => void;
	/** Brings a terminal pane into view — used to show the agent creating a PR. */
	onFocusTerminal?: (terminalId: string) => void;
}

/**
 * Top-bar Changes control: one bordered button with a single face covering
 * the branch's whole lifecycle. Before a PR exists the face is the diff
 * stats (opens the Changes pane) with the ship actions
 * (commit → push → create PR) in the chevron — or the ship action itself
 * once the tree is clean; once a PR exists the face is the PR badge alone,
 * with "Open changes" moving into its menu.
 *
 * Segments hide on their own: stats while status is unknown, the tree is
 * clean, or a PR owns the face; the right side while the flow state is
 * loading or unavailable — no dead placeholder affordances. `divide-x` puts
 * a hairline between whichever segments render, and `empty:hidden` collapses
 * the shell when none do, so the children keep their own null logic.
 */
export const ChangesControl = memo(function ChangesControl({
	workspaceId,
	onOpenChanges,
	onFocusTerminal,
}: ChangesControlProps) {
	const { t } = useLingui();
	const status = useWorkspaceGitStatus();
	const { flowState, onRetry } = usePRFlowState(workspaceId);
	const stats = useMemo(
		() => (status.data ? changesPillStats(status.data) : null),
		[status.data],
	);

	const label = t({
		id: "workspace.changesPill.openChanges",
		message: "Open changes",
	});

	const hasPr =
		flowState.kind === "pr-exists" ||
		((flowState.kind === "busy" || flowState.kind === "error") &&
			flowState.pr != null);
	const visibleStats =
		!hasPr && stats != null && stats.fileCount > 0 ? stats : null;

	return (
		<div className="flex h-7 items-stretch divide-x divide-border/60 overflow-hidden rounded-md border border-border/60 bg-muted/30 empty:hidden">
			{visibleStats && (
				<button
					type="button"
					onClick={onOpenChanges}
					aria-label={label}
					title={label}
					className="flex items-center gap-1 px-2 text-xs text-muted-foreground outline-none transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:bg-accent/60 focus-visible:text-foreground"
				>
					<GitCompareArrows className="size-3.5" />
					<span className="tabular-nums text-emerald-600 [.dark_&]:text-[#34d399]">
						+{visibleStats.additions}
					</span>
					<span className="tabular-nums text-red-600 [.dark_&]:text-[#f87171]">
						−{visibleStats.deletions}
					</span>
				</button>
			)}
			{flowState.kind === "no-pr" ? (
				<ShipControl
					workspaceId={workspaceId}
					sync={flowState.sync}
					onRefresh={onRetry}
					compact={visibleStats != null}
					onFocusTerminal={onFocusTerminal}
				/>
			) : (
				<PRStatusGroup
					state={flowState}
					workspaceId={workspaceId}
					onRefresh={onRetry}
					onOpenChanges={onOpenChanges}
				/>
			)}
		</div>
	);
});
