import type { CustomerStage } from "@superset/shared/customer-stage";
import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";

const STAGE_STYLES: Record<CustomerStage, string> = {
	solo: "text-muted-foreground",
	team: "border-transparent bg-violet-500/15 text-violet-400",
	scale: "border-transparent bg-indigo-500/15 text-indigo-400",
	enterprise: "border-transparent bg-fuchsia-500/15 text-fuchsia-400",
};

const STAGE_LABELS: Record<CustomerStage, string> = {
	solo: "Solo",
	team: "Team",
	scale: "Scale",
	enterprise: "Enterprise",
};

export interface StageBadgeProps {
	stage: CustomerStage;
}

/** Adoption-size tier derived from Superset usage (users at domain / members). */
export function StageBadge({ stage }: StageBadgeProps) {
	return (
		<Badge variant="outline" className={cn(STAGE_STYLES[stage])}>
			{STAGE_LABELS[stage]}
		</Badge>
	);
}
