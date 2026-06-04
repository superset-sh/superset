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

interface PRHeaderProps {
	pr: NormalizedPR;
}

export function PRHeader({ pr }: PRHeaderProps) {
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
			<div className="flex items-center gap-1.5">
				<span
					className={cn(
						"shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
						reviewDecisionConfig[pr.reviewDecision].className,
					)}
				>
					{reviewDecisionConfig[pr.reviewDecision].label}
				</span>
			</div>
		</div>
	);
}
