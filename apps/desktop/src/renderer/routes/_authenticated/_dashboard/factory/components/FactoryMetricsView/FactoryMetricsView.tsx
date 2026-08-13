import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	AGENT_STAGES_UI,
	type FactoryItem,
	STAGE_LABELS,
} from "../../constants";
import { DeliveryFlowChart } from "./components/DeliveryFlowChart";
import { QueueHealthBars } from "./components/QueueHealthBars";

const CARD = "rounded-lg border border-border px-3.5 py-2.5 text-left";
const LABEL = "text-xs text-muted-foreground";
const VALUE = "mt-0.5 text-lg font-medium leading-tight tabular-nums";
const DETAIL = "ml-1.5 text-xs font-normal text-muted-foreground";

function fmtHours(hours: number | null): string {
	if (hours == null) return "—";
	if (hours < 1) return "<1h";
	if (hours < 48) return `${Math.round(hours)}h`;
	return `${(hours / 24).toFixed(1)}d`;
}

interface FactoryMetricsViewProps {
	factoryId: string;
	items: FactoryItem[];
}

/** The windowed analytics sibling of the live board (30-day window). */
export function FactoryMetricsView({
	factoryId,
	items,
}: FactoryMetricsViewProps) {
	const { data: metrics } = cloudTrpc.factory.metrics.useQuery(
		{ factoryId },
		{ refetchInterval: 30_000 },
	);

	const inFlight = items.filter(
		(item) => item.stage !== "done" && item.stage !== "rejected",
	).length;
	const coverage = metrics?.coverage ?? {};
	const totals = Object.values(coverage).reduce(
		(acc, row) => {
			acc.agent += row.agent;
			acc.manual += row.manual;
			return acc;
		},
		{ agent: 0, manual: 0 },
	);
	const moves = totals.agent + totals.manual;
	const intake = metrics?.intakeMix ?? {};

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-4">
			<div className="grid shrink-0 grid-cols-3 gap-2">
				<div className={CARD} title="Issue created → done, last 30 days">
					<p className={LABEL}>Median cycle time</p>
					<p className={VALUE}>
						{fmtHours(metrics?.cycle.p50Hours ?? null)}
						{metrics && metrics.cycle.samples > 0 && (
							<span className={DETAIL}>
								p90 {fmtHours(metrics.cycle.p90Hours)} · {metrics.cycle.samples}{" "}
								samples
							</span>
						)}
					</p>
				</div>
				<div className={CARD}>
					<p className={LABEL}>In flight</p>
					<p className={VALUE}>
						{inFlight}
						<span className={DETAIL}>items in non-terminal stages</span>
					</p>
				</div>
				<div
					className={CARD}
					title="Stage moves made by agent reports vs humans, last 30 days"
				>
					<p className={LABEL}>Automated moves</p>
					<p className={VALUE}>
						{moves > 0 ? `${Math.round((totals.agent / moves) * 100)}%` : "—"}
						{moves > 0 && (
							<span className={DETAIL}>
								{totals.agent} of {moves} moves
							</span>
						)}
					</p>
				</div>
			</div>

			<DeliveryFlowChart dailyDone={metrics?.dailyDone ?? {}} />
			<QueueHealthBars items={items} />

			<div className="flex flex-col gap-1.5">
				<span className="text-xs font-medium text-muted-foreground">
					Automation coverage{" "}
					<span className="font-normal text-muted-foreground/70">· 30d</span>
				</span>
				<div className="flex flex-col gap-1">
					{AGENT_STAGES_UI.map((stage) => {
						const row = coverage[stage];
						return (
							<div
								key={stage}
								className="grid grid-cols-[7rem_1fr] items-center gap-2 text-xs"
							>
								<span className="text-muted-foreground">
									{STAGE_LABELS[stage]}
								</span>
								{row ? (
									<span className="text-muted-foreground">
										{row.agent} agent · {row.manual} manual
										<span className="text-muted-foreground/60">
											{" "}
											— {row.success} success · {row.flawed} flawed ·{" "}
											{row.blocked} blocked
										</span>
									</span>
								) : (
									<span className="text-muted-foreground/50">no runs</span>
								)}
							</div>
						);
					})}
				</div>
			</div>

			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<span className="font-medium">Intake · 30d</span>
				<span>
					{intake.github_issue ?? 0} issues · {intake.github_pr ?? 0} PRs
				</span>
			</div>
		</div>
	);
}
