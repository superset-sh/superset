import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/lib/utils";
import type { UsageSeverity } from "../../types";

interface UsageSeverityBadgeProps {
	severity: UsageSeverity;
}

export function UsageSeverityBadge({ severity }: UsageSeverityBadgeProps) {
	const { t } = useLingui();
	if (severity === "normal") return null;

	return (
		<span
			role="img"
			aria-label={
				severity === "high"
					? t({
							id: "dashboard.topBar.usageSeverity.high",
							message: "High usage",
						})
					: t({
							id: "dashboard.topBar.usageSeverity.elevated",
							message: "Elevated usage",
						})
			}
			className={cn(
				"h-1.5 w-1.5 shrink-0 rounded-full",
				severity === "high" ? "bg-red-500" : "bg-amber-500",
			)}
		/>
	);
}
