import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { cn } from "@superset/ui/utils";
import { LuArrowUpRight } from "react-icons/lu";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import type { NormalizedPR } from "../../types";

const reviewDecisionConfig = {
	approved: {
		label: msg({ id: "workspace.prHeader.approved", message: "Approved" }),
		className: "border border-success/20 bg-success/10 text-success",
	},
	changes_requested: {
		label: msg({
			id: "workspace.prHeader.changesRequested",
			message: "Changes requested",
		}),
		className:
			"border border-destructive/20 bg-destructive/10 text-destructive",
	},
	pending: {
		label: msg({
			id: "workspace.prHeader.reviewPending",
			message: "Review pending",
		}),
		className: "border border-warning/20 bg-warning/10 text-warning",
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
						"shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
						reviewDecisionConfig[pr.reviewDecision].className,
					)}
				>
					{i18n._(reviewDecisionConfig[pr.reviewDecision].label)}
				</span>
			</div>
		</div>
	);
}
