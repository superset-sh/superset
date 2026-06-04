import { cn } from "@superset/ui/lib/utils";
import type { UsageSeverity } from "../../types";

interface UsageSeverityBadgeProps {
	severity: UsageSeverity;
}

export function UsageSeverityBadge({ severity }: UsageSeverityBadgeProps) {
	if (severity === "normal") return null;

	return (
		<span
			role="img"
			aria-label={severity === "high" ? "High usage" : "Elevated usage"}
			className={cn(
				"h-1.5 w-1.5 shrink-0 rounded-full",
				severity === "high" ? "bg-red-500" : "bg-amber-500",
			)}
		/>
	);
}
