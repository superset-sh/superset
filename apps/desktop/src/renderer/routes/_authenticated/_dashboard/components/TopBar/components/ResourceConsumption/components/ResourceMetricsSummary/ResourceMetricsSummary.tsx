import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ResourceMetricsSnapshot } from "../../types";
import { formatCpu, formatMemory, formatPercent } from "../../utils/formatters";
import { getTrackedHostMemorySeverity } from "../../utils/resourceSeverity";
import { MetricBadge } from "../MetricBadge";

function getTrackedMemorySharePercent(
	totalMemory: number,
	hostTotalMemory: number,
): number {
	if (hostTotalMemory <= 0) return 0;
	return (totalMemory / hostTotalMemory) * 100;
}

interface ResourceMetricsSummaryProps {
	snapshot: ResourceMetricsSnapshot;
}

export function ResourceMetricsSummary({
	snapshot,
}: ResourceMetricsSummaryProps) {
	const { t } = useLingui();
	const trackedMemorySharePercent = getTrackedMemorySharePercent(
		snapshot.totalMemory,
		snapshot.host.totalMemory,
	);
	const clampedSharePercent = Math.min(
		100,
		Math.max(0, trackedMemorySharePercent),
	);

	const hostShareSeverity = getTrackedHostMemorySeverity(
		trackedMemorySharePercent,
	);
	const shareBarColorClass =
		hostShareSeverity === "high"
			? "bg-red-500/80"
			: hostShareSeverity === "elevated"
				? "bg-amber-500/80"
				: "bg-foreground/40";

	return (
		<>
			<div className="grid grid-cols-3 divide-x divide-border/50">
				<MetricBadge
					label={t({
						message: "CPU",
					})}
					value={formatCpu(snapshot.totalCpu)}
					tooltip={t({
						message:
							"Sum of CPU used by Superset and monitored terminal process trees. Over 100% means multiple CPU cores are busy. Sustained high values usually cause UI sluggishness and higher battery drain.",
					})}
				/>
				<MetricBadge
					label={t({
						message: "Memory",
					})}
					value={formatMemory(snapshot.totalMemory)}
					tooltip={t({
						message:
							"Resident memory used by Superset and monitored terminal process trees. If this keeps climbing without dropping, a workspace process may be retaining memory. High values increase swap risk and can cause stutter.",
					})}
				/>
				<MetricBadge
					label={t({
						message: "RAM Share",
					})}
					value={formatPercent(trackedMemorySharePercent)}
					tooltip={t({
						message:
							"Percent of total system RAM used by monitored Superset resources only (not all apps). A high share means Superset is a major contributor to system memory pressure; a low share means pressure is likely elsewhere.",
					})}
				/>
			</div>
			<Tooltip delayDuration={150}>
				<TooltipTrigger asChild>
					<div
						className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted/60"
						role="progressbar"
						aria-label={t({
							message: "System RAM share",
						})}
						aria-valuenow={Math.round(clampedSharePercent)}
						aria-valuemin={0}
						aria-valuemax={100}
					>
						<div
							className={cn(
								"h-full rounded-full transition-[width] duration-300",
								shareBarColorClass,
							)}
							style={{ width: `${clampedSharePercent}%` }}
						/>
					</div>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={6}>
					<Trans>
						Superset uses {formatPercent(trackedMemorySharePercent)} of system
						RAM
					</Trans>
				</TooltipContent>
			</Tooltip>
		</>
	);
}
