import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";

export interface PlanBadgeProps {
	plan: string | null | undefined;
	status: string | null | undefined;
	isPaying: boolean;
}

export function PlanBadge({ plan, status, isPaying }: PlanBadgeProps) {
	if (!plan) {
		return <Badge variant="outline">Free</Badge>;
	}

	const label = plan.charAt(0).toUpperCase() + plan.slice(1);
	const showStatus = status && status !== "active";

	return (
		<Badge
			variant={isPaying ? "default" : "outline"}
			className={cn(
				isPaying && "border-transparent bg-sky-500/15 text-sky-400",
			)}
		>
			{label}
			{showStatus && <span className="text-muted-foreground">· {status}</span>}
		</Badge>
	);
}
