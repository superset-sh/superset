import { cn } from "@superset/ui/utils";
import type { V2WorkspacePrState } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";

const STATE_BADGE_STYLES: Record<V2WorkspacePrState, string> = {
	open: "bg-emerald-500/15 text-emerald-500",
	draft: "bg-muted text-muted-foreground",
	merged: "bg-violet-500/15 text-violet-500",
	closed: "bg-destructive/15 text-destructive-foreground",
};

const STATE_BADGE_LABELS: Record<V2WorkspacePrState, string> = {
	open: "Open",
	draft: "Draft",
	merged: "Merged",
	closed: "Closed",
};

interface PrStateBadgeProps {
	state: V2WorkspacePrState;
}

export function PrStateBadge({ state }: PrStateBadgeProps) {
	return (
		<span
			className={cn(
				"shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
				STATE_BADGE_STYLES[state],
			)}
		>
			{STATE_BADGE_LABELS[state]}
		</span>
	);
}
