import type { UsageClasses, UsageSeverity, UsageValues } from "../types";

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

export function getUsageSeverity(
	values: UsageValues,
	totals: UsageValues,
	options: { includeShare?: boolean } = {},
): UsageSeverity {
	const { includeShare = true } = options;
	const isHighAbsolute = values.cpu >= 120 || values.memory >= 3 * GB;
	if (isHighAbsolute) return "high";

	const isElevatedAbsolute = values.cpu >= 70 || values.memory >= 1.5 * GB;
	if (isElevatedAbsolute) return "elevated";

	if (!includeShare) return "normal";

	const isCpuPressure = totals.cpu >= 60;
	const isMemoryPressure = totals.memory >= 1.5 * GB;
	if (!isCpuPressure && !isMemoryPressure) return "normal";

	const cpuShare = totals.cpu > 0 ? values.cpu / totals.cpu : 0;
	const memoryShare = totals.memory > 0 ? values.memory / totals.memory : 0;

	const isHighShare =
		(isCpuPressure && cpuShare >= 0.55 && values.cpu >= 25) ||
		(isMemoryPressure && memoryShare >= 0.55 && values.memory >= 768 * MB);
	if (isHighShare) return "high";

	const isElevatedShare =
		(isCpuPressure && cpuShare >= 0.35 && values.cpu >= 15) ||
		(isMemoryPressure && memoryShare >= 0.35 && values.memory >= 512 * MB);
	if (isElevatedShare) return "elevated";

	return "normal";
}

export function getUsageClasses(
	severity: UsageSeverity,
	nested = false,
): UsageClasses {
	const normalRowClass = nested ? "bg-muted/30" : "";
	const normalHoverClass = nested ? "hover:bg-muted/60" : "hover:bg-muted/50";

	if (severity === "high") {
		return {
			rowClass: nested ? "bg-destructive/6" : "bg-destructive/4",
			hoverClass: nested ? "hover:bg-destructive/10" : "hover:bg-destructive/8",
			labelClass: "text-foreground",
			metricClass: "text-destructive/90",
		};
	}

	if (severity === "elevated") {
		return {
			rowClass: nested ? "bg-amber-500/8" : "bg-amber-500/4",
			hoverClass: nested ? "hover:bg-amber-500/12" : "hover:bg-amber-500/8",
			labelClass: "text-foreground",
			metricClass: "text-amber-700 dark:text-amber-300",
		};
	}

	return {
		rowClass: normalRowClass,
		hoverClass: normalHoverClass,
		labelClass: "",
		metricClass: "text-muted-foreground",
	};
}

export function getTrackedHostMemorySeverity(
	trackedMemorySharePercent: number,
): UsageSeverity {
	if (trackedMemorySharePercent >= 35) return "high";
	if (trackedMemorySharePercent >= 20) return "elevated";
	return "normal";
}
