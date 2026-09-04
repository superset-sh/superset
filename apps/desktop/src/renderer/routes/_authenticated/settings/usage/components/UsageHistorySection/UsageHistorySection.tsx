import { Trans, useLingui } from "@lingui/react/macro";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuX } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { useHostUsageHistory } from "../../hooks/useHostUsageHistory";
import { UsageAreaChart } from "./components/UsageAreaChart";
import { UsageMetricTiles } from "./components/UsageMetricTiles";
import { UsageModelTable } from "./components/UsageModelTable";
import { UsageProjectBars } from "./components/UsageProjectBars";
import type { HistoryMetric } from "./constants";
import {
	AGENT_CHART_CONFIG,
	AGENT_ICON_KEY,
	AGENT_ORDER,
	RANGE_OPTIONS,
} from "./constants";
import { formatDayLabel, formatTokens, formatUsd } from "./utils/formatUsage";

type Agent = (typeof AGENT_ORDER)[number];

export function UsageHistorySection({ hostUrl }: { hostUrl: string | null }) {
	const { t } = useLingui();
	const [days, setDays] = useState<number>(30);
	const [metric, setMetric] = useState<HistoryMetric>("usd");
	const [hiddenAgents, setHiddenAgents] = useState<Set<Agent>>(new Set());
	const [selectedDay, setSelectedDay] = useState<string | null>(null);
	const historyQuery = useHostUsageHistory(hostUrl, days);
	const history = historyQuery.data ?? null;
	const isDark = useIsDarkTheme();

	const firstDay = history?.buckets[0]?.day;
	const lastDay = history?.buckets[history.buckets.length - 1]?.day;
	const selectedBucket =
		selectedDay && history
			? (history.buckets.find((bucket) => bucket.day === selectedDay) ?? null)
			: null;

	// Only agents with usage in range get a share row — nine zero rows
	// would drown the two that matter. No usage at all: show the classic two.
	const activeAgents = (() => {
		const withUsage = AGENT_ORDER.filter((agent) =>
			history?.buckets.some((bucket) => bucket.agents[agent]),
		);
		return withUsage.length > 0
			? withUsage
			: (["claude", "codex"] satisfies Agent[]);
	})();

	// A range switch can leave every active series hidden by stale toggles —
	// ignore the stored hides then, rather than render an empty chart.
	const effectiveHidden = activeAgents.some((agent) => !hiddenAgents.has(agent))
		? hiddenAgents
		: new Set<Agent>();

	const toggleAgent = (agent: Agent) => {
		setHiddenAgents((previous) => {
			const next = new Set(previous);
			if (next.has(agent)) {
				next.delete(agent);
			} else {
				// Never hide the last visible series — an empty chart reads as
				// broken. Count only active agents; hidden inactive ones don't.
				const visibleActive = activeAgents.filter(
					(active) => !next.has(active),
				).length;
				if (visibleActive > 1) next.add(agent);
			}
			return next;
		});
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 border-t pt-3">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					<Trans>Token usage</Trans>
				</h2>
				{firstDay && lastDay && (
					<span className="text-[10px] text-muted-foreground">
						<Trans>
							{formatDayLabel(firstDay)} – {formatDayLabel(lastDay)} · API-rate
							estimate from local session logs
						</Trans>
					</span>
				)}
				<div className="ml-auto flex items-center gap-1.5">
					<Tabs
						value={metric}
						onValueChange={(value) => setMetric(value as HistoryMetric)}
					>
						<TabsList className="h-6">
							<TabsTrigger value="usd" className="h-4 px-1.5 text-[10px]">
								<Trans>Cost</Trans>
							</TabsTrigger>
							<TabsTrigger value="tokens" className="h-4 px-1.5 text-[10px]">
								<Trans>Tokens</Trans>
							</TabsTrigger>
						</TabsList>
					</Tabs>
					<Tabs
						value={String(days)}
						onValueChange={(value) => setDays(Number(value))}
					>
						<TabsList className="h-6">
							{RANGE_OPTIONS.map((option) => (
								<TabsTrigger
									key={option}
									value={String(option)}
									className="h-4 px-1.5 text-[10px]"
								>
									{option}d
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</div>
			</div>

			{!history ? (
				<div className="py-6 text-center text-xs text-muted-foreground">
					{historyQuery.isError ? (
						<Trans>Couldn't read usage history from this host.</Trans>
					) : (
						<Trans>Scanning transcript logs…</Trans>
					)}
				</div>
			) : (
				<div
					className={cn(
						"flex min-h-0 flex-1 flex-col gap-3",
						historyQuery.isFetching && "opacity-70",
					)}
				>
					<div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[13rem_1fr]">
						<div className="flex flex-col gap-2">
							<div>
								<div className="text-2xl font-semibold tabular-nums leading-tight">
									{metric === "usd"
										? `${formatUsd(history.totals.usd)}*`
										: formatTokens(history.totals.tokens)}
								</div>
								<div className="text-[10px] text-muted-foreground">
									{metric === "usd" ? (
										<Trans>* if billed at full API rate</Trans>
									) : (
										<Trans>input, cache and output tokens</Trans>
									)}
								</div>
								{metric === "usd" && (
									<div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
										<Trans>Cost to you: $0</Trans>
									</div>
								)}
							</div>
							<div className="flex flex-col gap-1.5">
								{activeAgents.map((agent) => {
									const totalsFor = history.buckets.reduce(
										(acc, bucket) => {
											const slot = bucket.agents[agent];
											acc.usd += slot?.usd ?? 0;
											acc.tokens += slot?.tokens ?? 0;
											return acc;
										},
										{ usd: 0, tokens: 0 },
									);
									const denominator =
										metric === "usd"
											? history.totals.usd
											: history.totals.tokens;
									const share =
										denominator > 0
											? (metric === "usd" ? totalsFor.usd : totalsFor.tokens) /
												denominator
											: 0;
									const hidden = effectiveHidden.has(agent);
									const icon = getPresetIcon(AGENT_ICON_KEY[agent], isDark);
									return (
										<button
											key={agent}
											type="button"
											onClick={() => toggleAgent(agent)}
											title={
												hidden
													? t({
															message: "Show in chart",
														})
													: t({
															message: "Hide from chart",
														})
											}
											className={cn(
												"flex items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] transition-colors hover:bg-muted/60",
												hidden && "opacity-40",
											)}
										>
											<span
												className={cn(
													"size-2 shrink-0 rounded-[2px]",
													hidden && "opacity-40",
												)}
												style={{
													background: AGENT_CHART_CONFIG[agent].color,
												}}
											/>
											{icon && (
												<img src={icon} alt="" className="size-3.5 shrink-0" />
											)}
											<span className="min-w-0 truncate">
												{AGENT_CHART_CONFIG[agent].label}
											</span>
											<span className="ml-auto shrink-0 tabular-nums">
												{metric === "usd"
													? formatUsd(totalsFor.usd)
													: formatTokens(totalsFor.tokens)}
											</span>
											<span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
												{Math.round(100 * share)}%
											</span>
										</button>
									);
								})}
							</div>
							{selectedBucket && (
								<div className="rounded-md border bg-card/60 p-2 text-[11px]">
									<div className="flex items-center">
										<span className="font-medium">
											{formatDayLabel(selectedBucket.day)}
										</span>
										<button
											type="button"
											className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
											onClick={() => setSelectedDay(null)}
											aria-label={t({
												message: "Clear selected day",
											})}
										>
											<LuX className="size-3" />
										</button>
									</div>
									{activeAgents.map((agent) => {
										const slot = selectedBucket.agents[agent];
										if (!slot) return null;
										const icon = getPresetIcon(AGENT_ICON_KEY[agent], isDark);
										return (
											<div
												key={agent}
												className="flex items-center gap-1.5 tabular-nums"
											>
												<span
													className="size-1.5 rounded-[2px]"
													style={{
														background: AGENT_CHART_CONFIG[agent].color,
													}}
												/>
												{icon && (
													<img src={icon} alt="" className="size-3 shrink-0" />
												)}
												<span className="text-muted-foreground">
													{AGENT_CHART_CONFIG[agent].label}
												</span>
												<span className="ml-auto">
													{formatUsd(slot.usd)} · {formatTokens(slot.tokens)}
												</span>
											</div>
										);
									})}
									<div className="mt-0.5 border-t pt-0.5 text-right font-medium tabular-nums">
										{formatUsd(selectedBucket.usd)} ·{" "}
										{formatTokens(selectedBucket.tokens)}
									</div>
								</div>
							)}
						</div>
						<UsageAreaChart
							history={history}
							metric={metric}
							hiddenAgents={effectiveHidden}
							selectedDay={selectedDay}
							onSelectDay={setSelectedDay}
						/>
					</div>

					<UsageMetricTiles history={history} />

					<div className="grid gap-4 md:grid-cols-2">
						<UsageModelTable history={history} />
						<UsageProjectBars history={history} />
					</div>
				</div>
			)}
		</div>
	);
}
