import { cn } from "@superset/ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { HostMetrics } from "../../types";
import { formatMemory, formatPercent } from "../../utils/formatters";
import { getTrackedHostMemorySeverity } from "../../utils/resourceSeverity";
import { UsageSeverityBadge } from "../UsageSeverityBadge";

const METRIC_COLS = "flex items-center shrink-0 tabular-nums tracking-tight";
const VALUE_COL = "w-20 text-right";

interface HostResourceSectionProps {
	host: HostMetrics;
}

interface SubRowProps {
	label: string;
	value: string;
	tooltip?: string;
}

function SubRow({ label, value, tooltip }: SubRowProps) {
	const content = (
		<div className="group flex items-center justify-between px-3.5 pl-7 py-1 hover:bg-foreground/[0.04] transition-colors">
			<span className="text-[11px] text-muted-foreground/90 truncate min-w-0 mr-2">
				{label}
			</span>
			<div className={cn(METRIC_COLS, "text-[11px] text-muted-foreground/80")}>
				<span className={VALUE_COL}>{value}</span>
			</div>
		</div>
	);

	if (!tooltip) return content;

	return (
		<Tooltip delayDuration={150}>
			<TooltipTrigger asChild>{content}</TooltipTrigger>
			<TooltipContent side="top" sideOffset={6} showArrow={false}>
				{tooltip}
			</TooltipContent>
		</Tooltip>
	);
}

export function getNormalizedHostCpuPercent(host: HostMetrics): number {
	if (host.cpuCoreCount <= 0) return 0;
	const percent = (host.loadAverage1m / host.cpuCoreCount) * 100;
	if (!Number.isFinite(percent) || percent < 0) return 0;
	return Math.min(100, percent);
}

export function HostResourceSection({ host }: HostResourceSectionProps) {
	const memorySeverity = getTrackedHostMemorySeverity(host.memoryUsagePercent);
	const cpuPercent = getNormalizedHostCpuPercent(host);

	return (
		<div className="border-b border-border/60 py-1">
			<div className="flex items-center justify-between px-3.5 py-1.5">
				<div className="flex items-center gap-1.5 min-w-0 mr-2">
					<span className="text-[12px] font-medium text-foreground truncate min-w-0">
						System
					</span>
					<UsageSeverityBadge severity={memorySeverity} />
				</div>
				<div className={cn(METRIC_COLS, "text-[12px] text-foreground")}>
					<span className={VALUE_COL}>
						{formatPercent(host.memoryUsagePercent)} RAM
					</span>
				</div>
			</div>

			<SubRow
				label="CPU load (1m)"
				value={`${formatPercent(cpuPercent)} of ${host.cpuCoreCount} cores`}
				tooltip="1-minute load average normalised by CPU core count. Values near or above 100% mean the whole machine — not just Superset — is busy."
			/>
			<SubRow
				label="RAM used"
				value={formatMemory(host.usedMemory)}
				tooltip="Total RAM in use across all applications on this machine, not just Superset."
			/>
			<SubRow
				label="RAM free"
				value={formatMemory(host.freeMemory)}
				tooltip="Free RAM reported by the OS. When this approaches zero the system swaps and stutters."
			/>
		</div>
	);
}
