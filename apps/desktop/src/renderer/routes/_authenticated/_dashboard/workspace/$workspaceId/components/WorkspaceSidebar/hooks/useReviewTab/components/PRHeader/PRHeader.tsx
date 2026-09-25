import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { cn } from "@superset/ui/utils";
import { LuArrowRight, LuArrowUpRight } from "react-icons/lu";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import type { NormalizedPR } from "../../types";

const reviewDecisionConfig = {
	approved: {
		label: msg({ message: "Approved" }),
		className:
			"border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	},
	changes_requested: {
		label: msg({
			message: "Changes requested",
		}),
		className:
			"border border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
	},
	pending: {
		label: msg({
			message: "Review pending",
		}),
		className:
			"border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	},
} as const;

interface PRHeaderProps {
	pr: NormalizedPR;
	/**
	 * Opens the PR's summary pane in the workspace. Without it the title is
	 * a plain GitHub link, for hosts that have no pane store to open into.
	 */
	onOpenPullRequest?: (prNumber: number) => void;
}

const titleClass =
	"group flex w-full items-center gap-1.5 cursor-pointer text-left";
const arrowClass =
	"size-3.5 shrink-0 text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100";

export function PRHeader({ pr, onOpenPullRequest }: PRHeaderProps) {
	const titleContent = (
		<>
			<PRIcon state={pr.state} className="size-4 shrink-0" />
			<span
				className="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
				title={pr.title}
			>
				{pr.title}
			</span>
		</>
	);
	return (
		<div className="space-y-1.5 px-2 py-2">
			{onOpenPullRequest ? (
				<button
					type="button"
					onClick={() => onOpenPullRequest(pr.number)}
					className={titleClass}
				>
					{titleContent}
					<LuArrowRight aria-hidden="true" className={arrowClass} />
				</button>
			) : (
				<a
					href={pr.url}
					target="_blank"
					rel="noopener noreferrer"
					className={titleClass}
				>
					{titleContent}
					<LuArrowUpRight aria-hidden="true" className={arrowClass} />
				</a>
			)}
			<div className="flex items-center gap-1.5">
				<span
					className={cn(
						"shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
						reviewDecisionConfig[pr.reviewDecision].className,
					)}
				>
					{i18n._(reviewDecisionConfig[pr.reviewDecision].label)}
				</span>
			</div>
		</div>
	);
}
