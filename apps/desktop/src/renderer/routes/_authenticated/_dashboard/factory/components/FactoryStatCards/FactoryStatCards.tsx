import type { RouterOutputs } from "@superset/trpc";
import { cn } from "@superset/ui/utils";

type FactoryStats = RouterOutputs["factory"]["stats"];

const CARD = "rounded-lg border border-border px-3.5 py-2.5 text-left";
const LABEL = "text-xs text-muted-foreground";
const VALUE = "mt-0.5 text-lg font-medium leading-tight tabular-nums";

interface FactoryStatCardsProps {
	stats: FactoryStats | undefined;
}

export function FactoryStatCards({ stats }: FactoryStatCardsProps) {
	const outcomes = stats?.outcomes7d ?? {};
	const success = outcomes.success ?? 0;
	const flawed = outcomes.flawed ?? 0;
	const blockedRuns = outcomes.blocked ?? 0;
	const agentReports = success + flawed + blockedRuns;
	const successRate =
		agentReports > 0 ? `${Math.round((success / agentReports) * 100)}%` : "—";

	return (
		<div className="grid shrink-0 grid-cols-4 gap-2">
			<div className={CARD}>
				<p className={LABEL}>Active items</p>
				<p className={VALUE}>{stats?.active ?? "—"}</p>
			</div>
			<div className={CARD} title="Items that reached Done in the last 7 days">
				<p className={LABEL}>
					Done <span className="text-muted-foreground/60">· 7d</span>
				</p>
				<p className={VALUE}>
					{stats?.done7d ?? "—"}
					{stats != null && (
						<span className="ml-1.5 text-xs font-normal text-muted-foreground">
							{stats.done30d} · 30d
						</span>
					)}
				</p>
			</div>
			<div
				className={cn(
					CARD,
					(stats?.blocked ?? 0) > 0 && "border-amber-500/40 bg-amber-500/5",
				)}
				title="Items whose last run wedged — blocked, offline, or failed dispatch"
			>
				<p className={LABEL}>Needs attention</p>
				<p
					className={cn(
						VALUE,
						(stats?.blocked ?? 0) > 0 && "text-amber-600 dark:text-amber-400",
					)}
				>
					{stats?.blocked ?? "—"}
				</p>
			</div>
			<div
				className={CARD}
				title={`Agent runs last 7d — ${success} success · ${flawed} flawed · ${blockedRuns} blocked`}
			>
				<p className={LABEL}>
					Success rate <span className="text-muted-foreground/60">· 7d</span>
				</p>
				<p className={VALUE}>
					{successRate}
					{agentReports > 0 && (
						<span className="ml-1.5 text-xs font-normal text-muted-foreground">
							{success}/{agentReports} runs
						</span>
					)}
				</p>
			</div>
		</div>
	);
}
