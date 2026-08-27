import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuX } from "react-icons/lu";
import { useHostUsageHistory } from "../../hooks/useHostUsageHistory";
import { UsageAreaChart } from "./components/UsageAreaChart";
import { UsageMetricTiles } from "./components/UsageMetricTiles";
import { UsageModelTable } from "./components/UsageModelTable";
import { UsageProjectBars } from "./components/UsageProjectBars";
import type { HistoryMetric } from "./constants";
import {
	PROVIDER_CHART_CONFIG,
	PROVIDER_ORDER,
	RANGE_OPTIONS,
} from "./constants";
import { formatDayLabel, formatTokens, formatUsd } from "./utils/formatUsage";

type Provider = (typeof PROVIDER_ORDER)[number];

export function UsageHistorySection({ hostUrl }: { hostUrl: string | null }) {
	const [days, setDays] = useState<number>(30);
	const [metric, setMetric] = useState<HistoryMetric>("usd");
	const [hiddenProviders, setHiddenProviders] = useState<Set<Provider>>(
		new Set(),
	);
	const [selectedDay, setSelectedDay] = useState<string | null>(null);
	const historyQuery = useHostUsageHistory(hostUrl, days);
	const history = historyQuery.data ?? null;

	const firstDay = history?.buckets[0]?.day;
	const lastDay = history?.buckets[history.buckets.length - 1]?.day;
	const selectedBucket =
		selectedDay && history
			? (history.buckets.find((bucket) => bucket.day === selectedDay) ?? null)
			: null;

	const toggleProvider = (provider: Provider) => {
		setHiddenProviders((previous) => {
			const next = new Set(previous);
			if (next.has(provider)) {
				next.delete(provider);
			} else if (next.size < PROVIDER_ORDER.length - 1) {
				// Never hide the last visible series — an empty chart reads as broken.
				next.add(provider);
			}
			return next;
		});
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 border-t pt-3">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Token usage
				</h2>
				{firstDay && lastDay && (
					<span className="text-[10px] text-muted-foreground">
						{formatDayLabel(firstDay)} – {formatDayLabel(lastDay)} · API-rate
						estimate from local session logs
					</span>
				)}
				<div className="ml-auto flex items-center gap-1.5">
					<Tabs
						value={metric}
						onValueChange={(value) => setMetric(value as HistoryMetric)}
					>
						<TabsList className="h-6">
							<TabsTrigger value="usd" className="h-4 px-1.5 text-[10px]">
								Cost
							</TabsTrigger>
							<TabsTrigger value="tokens" className="h-4 px-1.5 text-[10px]">
								Tokens
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
					{historyQuery.isError
						? "Couldn't read usage history from this host."
						: "Scanning transcript logs…"}
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
									{metric === "usd"
										? "* if billed at full API rate"
										: "input, cache and output tokens"}
								</div>
								{metric === "usd" && (
									<div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
										Cost to you: $0
									</div>
								)}
							</div>
							<div className="flex flex-col gap-1.5">
								{PROVIDER_ORDER.map((provider) => {
									const totalsFor = history.buckets.reduce(
										(acc, bucket) => {
											const slot = bucket.providers[provider];
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
									const hidden = hiddenProviders.has(provider);
									return (
										<button
											key={provider}
											type="button"
											onClick={() => toggleProvider(provider)}
											title={hidden ? "Show in chart" : "Hide from chart"}
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
													background: PROVIDER_CHART_CONFIG[provider].color,
												}}
											/>
											<span className="min-w-0 truncate">
												{PROVIDER_CHART_CONFIG[provider].label}
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
											aria-label="Clear selected day"
										>
											<LuX className="size-3" />
										</button>
									</div>
									{PROVIDER_ORDER.map((provider) => {
										const slot = selectedBucket.providers[provider];
										if (!slot) return null;
										return (
											<div
												key={provider}
												className="flex items-center gap-1.5 tabular-nums"
											>
												<span
													className="size-1.5 rounded-[2px]"
													style={{
														background: PROVIDER_CHART_CONFIG[provider].color,
													}}
												/>
												<span className="text-muted-foreground">
													{PROVIDER_CHART_CONFIG[provider].label}
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
							hiddenProviders={hiddenProviders}
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
