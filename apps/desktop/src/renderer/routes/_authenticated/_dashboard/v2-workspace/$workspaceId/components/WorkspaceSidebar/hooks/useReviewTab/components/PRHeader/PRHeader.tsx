import { cn } from "@superset/ui/utils";
import { LuArrowUpRight } from "react-icons/lu";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import type { NormalizedPR } from "../../types";

const reviewDecisionConfig = {
	approved: {
		label: "Approved",
		className:
			"border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	},
	changes_requested: {
		label: "Changes requested",
		className:
			"border border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
	},
	pending: {
		label: "Review pending",
		className:
			"border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	},
} as const;

/** Maps GitLab `detailedMergeStatus` to a short human-readable label for
 * non-review blocking reasons. Returns null for statuses that don't need a
 * separate chip (e.g. "mergeable", "approved", etc.). */
function getMergeBlockLabel(detailedMergeStatus: string): string | null {
	switch (detailedMergeStatus) {
		case "conflict":
			return "Conflicts";
		case "ci_must_pass":
		case "ci_still_running":
			return "Pipeline must pass";
		case "discussions_not_resolved":
			return "Unresolved threads";
		case "need_rebase":
			return "Needs rebase";
		default:
			return null;
	}
}

interface PRHeaderProps {
	pr: NormalizedPR;
}

export function PRHeader({ pr }: PRHeaderProps) {
	const chipBase = "shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium";

	const glState = pr.gitlabReviewState;

	// Approvals chip — only shown when approvalsRequired is non-null and > 0
	const approvalsChip: React.ReactNode = (() => {
		if (!glState) return null;
		const { approvalsRequired, approvalsLeft } = glState;
		// No chip when the project has no approval rule (null or 0 required).
		if (!approvalsRequired) return null;
		const received = approvalsRequired - (approvalsLeft ?? approvalsRequired);
		return (
			<span
				className={cn(
					chipBase,
					"border border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300",
				)}
			>
				{`Approvals ${received}/${approvalsRequired}`}
			</span>
		);
	})();

	// Merge-block reason chip
	const mergeBlockChip: React.ReactNode = (() => {
		if (!glState) return null;
		const label = getMergeBlockLabel(glState.detailedMergeStatus);
		if (!label) return null;
		return (
			<span
				className={cn(
					chipBase,
					"border border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300",
				)}
			>
				{label}
			</span>
		);
	})();

	return (
		<div className="space-y-1.5 px-2 py-2">
			<a
				href={pr.url}
				target="_blank"
				rel="noopener noreferrer"
				className="group flex items-center gap-1.5 cursor-pointer"
			>
				<PRIcon state={pr.state} className="size-4 shrink-0" />
				<span
					className="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
					title={pr.title}
				>
					{pr.title}
				</span>
				<LuArrowUpRight
					aria-hidden="true"
					className="size-3.5 shrink-0 text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
				/>
			</a>
			<div className="flex flex-wrap items-center gap-1.5">
				{/* Primary review-decision badge — identical for GitHub and GitLab */}
				<span
					className={cn(
						chipBase,
						reviewDecisionConfig[pr.reviewDecision].className,
					)}
				>
					{reviewDecisionConfig[pr.reviewDecision].label}
				</span>
				{/* GitLab-only additive chips (absent for GitHub PRs) */}
				{approvalsChip}
				{mergeBlockChip}
			</div>
		</div>
	);
}
