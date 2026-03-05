import { cn } from "@superset/ui/lib/utils";
import type { UsageSeverity } from "../../types";

interface UsageSeverityBadgeProps {
	severity: UsageSeverity;
}

export function UsageSeverityBadge({ severity }: UsageSeverityBadgeProps) {
	if (severity === "normal") return null;

	return (
		<span
			className={cn(
				"rounded px-1 py-0.5 text-[10px] font-medium",
				severity === "high" && "bg-destructive/12 text-destructive/90",
				severity === "elevated" &&
					"bg-amber-500/12 text-amber-700 dark:text-amber-300",
			)}
		>
			{severity === "high" ? "Hot" : "Elevated"}
		</span>
	);
}
