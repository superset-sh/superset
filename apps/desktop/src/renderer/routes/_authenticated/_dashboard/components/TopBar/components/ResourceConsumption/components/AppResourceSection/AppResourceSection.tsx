import { cn } from "@superset/ui/lib/utils";
import type { AppMetrics, UsageValues } from "../../types";
import { formatCpu, formatMemory } from "../../utils/formatters";
import {
	getUsageClasses,
	getUsageSeverity,
} from "../../utils/resourceSeverity";
import { UsageSeverityBadge } from "../UsageSeverityBadge";

const METRIC_COLS = "flex items-center shrink-0 tabular-nums";
const CPU_COL = "w-12 text-right";
const MEM_COL = "w-16 text-right";

interface AppResourceSectionProps {
	app: AppMetrics;
	totalUsage: UsageValues;
}

export function AppResourceSection({
	app,
	totalUsage,
}: AppResourceSectionProps) {
	const appSeverity = getUsageSeverity(app, totalUsage);
	const appClasses = getUsageClasses(appSeverity);

	const mainSeverity = getUsageSeverity(app.main, app);
	const mainClasses = getUsageClasses(mainSeverity, true);

	const rendererSeverity = getUsageSeverity(app.renderer, app);
	const rendererClasses = getUsageClasses(rendererSeverity, true);

	const otherSeverity = getUsageSeverity(app.other, app);
	const otherClasses = getUsageClasses(otherSeverity, true);

	return (
		<div className="border-b border-border/50">
			<div
				className={cn(
					"px-3 py-2 flex items-center justify-between",
					appClasses.rowClass,
				)}
			>
				<div className="flex items-center gap-1.5 min-w-0 mr-2">
					<span
						className={cn(
							"text-xs font-medium min-w-0 truncate",
							appClasses.labelClass,
						)}
					>
						Superset App
					</span>
					<UsageSeverityBadge severity={appSeverity} />
				</div>
				<div className={cn(METRIC_COLS, "text-xs", appClasses.metricClass)}>
					<span className={CPU_COL}>{formatCpu(app.cpu)}</span>
					<span className={MEM_COL}>{formatMemory(app.memory)}</span>
				</div>
			</div>

			<div
				className={cn(
					"px-3 py-1.5 pl-6 flex items-center justify-between",
					mainClasses.rowClass,
				)}
			>
				<span
					className={cn(
						"text-[11px] text-muted-foreground min-w-0 truncate",
						mainClasses.labelClass,
					)}
				>
					Main
				</span>
				<div
					className={cn(METRIC_COLS, "text-[11px]", mainClasses.metricClass)}
				>
					<span className={CPU_COL}>{formatCpu(app.main.cpu)}</span>
					<span className={MEM_COL}>{formatMemory(app.main.memory)}</span>
				</div>
			</div>

			<div
				className={cn(
					"px-3 py-1.5 pl-6 flex items-center justify-between",
					rendererClasses.rowClass,
				)}
			>
				<span
					className={cn(
						"text-[11px] text-muted-foreground min-w-0 truncate",
						rendererClasses.labelClass,
					)}
				>
					Renderer
				</span>
				<div
					className={cn(
						METRIC_COLS,
						"text-[11px]",
						rendererClasses.metricClass,
					)}
				>
					<span className={CPU_COL}>{formatCpu(app.renderer.cpu)}</span>
					<span className={MEM_COL}>{formatMemory(app.renderer.memory)}</span>
				</div>
			</div>

			{(app.other.cpu > 0 || app.other.memory > 0) && (
				<div
					className={cn(
						"px-3 py-1.5 pl-6 flex items-center justify-between",
						otherClasses.rowClass,
					)}
				>
					<span
						className={cn(
							"text-[11px] text-muted-foreground min-w-0 truncate",
							otherClasses.labelClass,
						)}
					>
						Other
					</span>
					<div
						className={cn(METRIC_COLS, "text-[11px]", otherClasses.metricClass)}
					>
						<span className={CPU_COL}>{formatCpu(app.other.cpu)}</span>
						<span className={MEM_COL}>{formatMemory(app.other.memory)}</span>
					</div>
				</div>
			)}
		</div>
	);
}
