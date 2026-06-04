import { cn } from "@superset/ui/utils";
import type { V2WorkspacePrReviewDecision } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";

const REVIEW_BADGE_STYLES: Record<V2WorkspacePrReviewDecision, string> = {
	approved: "bg-emerald-500/15 text-emerald-500",
	changes_requested: "bg-destructive/15 text-destructive-foreground",
	pending: "bg-amber-500/15 text-amber-500",
};

const REVIEW_BADGE_LABELS: Record<V2WorkspacePrReviewDecision, string> = {
	approved: "Approved",
	changes_requested: "Changes requested",
	pending: "Review pending",
};

interface ReviewStatusBadgeProps {
	status: V2WorkspacePrReviewDecision;
}

export function ReviewStatusBadge({ status }: ReviewStatusBadgeProps) {
	return (
		<span
			className={cn(
				"max-w-[200px] shrink-0 truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium",
				REVIEW_BADGE_STYLES[status],
			)}
		>
			{REVIEW_BADGE_LABELS[status]}
		</span>
	);
}
