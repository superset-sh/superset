import { cn } from "@superset/ui/lib/utils";
import type { AppMetrics, UsageValues } from "../../types";
import { formatCpu, formatMemory } from "../../utils/formatters";
import { getUsageSeverity } from "../../utils/resourceSeverity";
import { UsageSeverityBadge } from "../UsageSeverityBadge";

const METRIC_COLS = "flex items-center shrink-0 tabular-nums tracking-tight";
const CPU_COL = "w-12 text-right";
const MEM_COL = "w-16 text-right";

interface AppResourceSectionProps {
	app: AppMetrics;
	totalUsage: UsageValues;
}

interface SubRowProps {
	label: string;
	cpu: number;
	memory: number;
	severity: ReturnType<typeof getUsageSeverity>;
}

function SubRow({ label, cpu, memory, severity }: SubRowProps) {
	return (
		<div className="group flex items-center justify-between px-3.5 pl-7 py-1 hover:bg-foreground/[0.04] transition-colors">
			<div className="flex items-center gap-1.5 min-w-0 mr-2">
				<span className="text-[11px] text-muted-foreground/90 truncate min-w-0">
					{label}
				</span>
				<UsageSeverityBadge severity={severity} />
			</div>
			<div className={cn(METRIC_COLS, "text-[11px] text-muted-foreground/80")}>
				<span className={CPU_COL}>{formatCpu(cpu)}</span>
				<span className={MEM_COL}>{formatMemory(memory)}</span>
			</div>
		</div>
	);
}

export function AppResourceSection({
	app,
	totalUsage,
}: AppResourceSectionProps) {
	const appSeverity = getUsageSeverity(app, totalUsage);
	const mainSeverity = getUsageSeverity(app.main, app);
	const rendererSeverity = getUsageSeverity(app.renderer, app);
	const otherSeverity = getUsageSeverity(app.other, app);
	const showOther = app.other.cpu > 0 || app.other.memory > 0;

	return (
		<div className="border-b border-border/60 py-1">
			<div className="flex items-center justify-between px-3.5 py-1.5">
				<div className="flex items-center gap-1.5 min-w-0 mr-2">
					<span className="text-[12px] font-medium text-foreground truncate min-w-0">
						Superset App
					</span>
					<UsageSeverityBadge severity={appSeverity} />
				</div>
				<div className={cn(METRIC_COLS, "text-[12px] text-foreground")}>
					<span className={CPU_COL}>{formatCpu(app.cpu)}</span>
					<span className={MEM_COL}>{formatMemory(app.memory)}</span>
				</div>
			</div>

			<SubRow
				label="Main"
				cpu={app.main.cpu}
				memory={app.main.memory}
				severity={mainSeverity}
			/>
			<SubRow
				label="Renderer"
				cpu={app.renderer.cpu}
				memory={app.renderer.memory}
				severity={rendererSeverity}
			/>
			{showOther && (
				<SubRow
					label="Other"
					cpu={app.other.cpu}
					memory={app.other.memory}
					severity={otherSeverity}
				/>
			)}
		</div>
	);
}
