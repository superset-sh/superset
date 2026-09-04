import { Trans, useLingui } from "@lingui/react/macro";
import type { ChartConfig } from "@superset/ui/chart";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { LuArrowLeft, LuCheck, LuCopy } from "react-icons/lu";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useHostUsageHistory } from "../../hooks/useHostUsageHistory";
import type { HistoryMetric } from "../UsageHistorySection/constants";
import {
	AGENT_CHART_CONFIG,
	RANGE_OPTIONS,
} from "../UsageHistorySection/constants";
import {
	formatDayLabel,
	formatTokens,
	formatUsd,
} from "../UsageHistorySection/utils/formatUsage";

export type DrilldownKind = "workspace" | "model";

/**
 * One entity's page — a workspace or a model — with its own daily series
 * and the cross-breakdown (models for a workspace, workspaces for a model).
 * Renders from the same cached history query; no extra host scan.
 */
export function UsageDrilldownPage({
	hostUrl,
	kind,
	entityKey,
}: {
	hostUrl: string | null;
	kind: DrilldownKind;
	entityKey: string;
}) {
	const { t } = useLingui();
	const [days, setDays] = useState<number>(30);
	const [metric, setMetric] = useState<HistoryMetric>("usd");
	const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const copySessionId = (id: string) => {
		navigator.clipboard.writeText(id).then(() => {
			setCopiedSessionId(id);
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
			copyTimeoutRef.current = setTimeout(() => setCopiedSessionId(null), 2000);
		});
	};
	const historyQuery = useHostUsageHistory(hostUrl, days);
	const history = historyQuery.data ?? null;

	const detail = history
		? ((kind === "workspace"
				? history.projectDetails[entityKey]
				: history.modelDetails[entityKey]) ?? null)
		: null;

	const agent =
		kind === "model"
			? (entityKey.split("|")[0] as keyof typeof AGENT_CHART_CONFIG)
			: null;
	const title = kind === "model" ? entityKey.split("|")[1] : entityKey;
	const seriesColor =
		agent && AGENT_CHART_CONFIG[agent]
			? AGENT_CHART_CONFIG[agent].color
			: "#d06a48";
	const chartConfig = {
		value: {
			label:
				title ??
				t({
					message: "Usage",
				}),
			color: seriesColor,
		},
	} satisfies ChartConfig;

	// Zero-fill the sparse per-entity series against the range's day list so
	// quiet days render as zero instead of vanishing.
	const data = useMemo(() => {
		if (!history || !detail) return [];
		const byDay = new Map(detail.days.map((slice) => [slice.day, slice]));
		return history.buckets.map((bucket) => ({
			day: bucket.day,
			value: byDay.get(bucket.day)?.[metric] ?? 0,
		}));
	}, [history, detail, metric]);

	const formatValue = metric === "usd" ? formatUsd : formatTokens;
	const ticks =
		data.length >= 3
			? [
					data[0]?.day,
					data[Math.floor(data.length / 2)]?.day,
					data[data.length - 1]?.day,
				].filter((d): d is string => !!d)
			: undefined;
	const shareOfTotal =
		history && detail
			? metric === "usd"
				? history.totals.usd > 0
					? detail.usd / history.totals.usd
					: 0
				: history.totals.tokens > 0
					? detail.tokens / history.totals.tokens
					: 0
			: 0;
	const breakdownMax = detail?.breakdown[0]?.usd ?? 0;

	return (
		<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-3 px-6 py-4">
			<div className="flex flex-wrap items-center gap-2">
				<Link
					to="/settings/usage"
					className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<LuArrowLeft className="size-3" />
					<Trans>Usage</Trans>
				</Link>
				<span className="text-muted-foreground/60">/</span>
				<h1 className="flex items-center gap-2 text-base font-semibold tracking-tight">
					<span
						className="size-2.5 rounded-[3px]"
						style={{ background: seriesColor }}
					/>
					{title}
				</h1>
				<span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
					{kind === "workspace" ? (
						<Trans>workspace</Trans>
					) : (
						<Trans>model</Trans>
					)}
				</span>
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
				<div className="py-8 text-center text-xs text-muted-foreground">
					<Trans>Loading usage history…</Trans>
				</div>
			) : !detail ? (
				<div className="py-8 text-center text-xs text-muted-foreground">
					{kind === "workspace" ? (
						<Trans>
							No usage recorded for this workspace in the selected range.
						</Trans>
					) : (
						<Trans>
							No usage recorded for this model in the selected range.
						</Trans>
					)}
				</div>
			) : (
				<>
					<div className="flex items-baseline gap-4">
						<span className="text-2xl font-semibold tabular-nums">
							{metric === "usd"
								? `${formatUsd(detail.usd)}*`
								: formatTokens(detail.tokens)}
						</span>
						<span className="text-[11px] text-muted-foreground">
							{metric === "usd" ? (
								<Trans>
									{Math.round(100 * shareOfTotal)}% of total cost ·{" "}
									{formatTokens(detail.tokens)} tokens · * at API list rates
								</Trans>
							) : (
								<Trans>
									{Math.round(100 * shareOfTotal)}% of all tokens ·{" "}
									{formatTokens(detail.tokens)} tokens
								</Trans>
							)}
						</span>
					</div>

					<ChartContainer
						config={chartConfig}
						className="aspect-auto h-64 w-full"
					>
						<AreaChart data={data} margin={{ left: 4, right: 4, top: 4 }}>
							<CartesianGrid vertical={false} strokeOpacity={0.35} />
							<XAxis
								dataKey="day"
								ticks={ticks}
								tickFormatter={formatDayLabel}
								tickLine={false}
								axisLine={false}
								tickMargin={8}
								className="text-[10px]"
							/>
							<YAxis
								width={44}
								tickCount={4}
								tickFormatter={(value: number) => formatValue(value)}
								tickLine={false}
								axisLine={false}
								className="text-[10px]"
							/>
							<ChartTooltip
								cursor={{ strokeDasharray: "3 3" }}
								content={
									<ChartTooltipContent
										labelFormatter={(value) => formatDayLabel(String(value))}
										formatter={(value) => (
											<span className="ml-auto font-mono tabular-nums">
												{formatValue(Number(value))}
											</span>
										)}
									/>
								}
							/>
							<Area
								dataKey="value"
								type="monotone"
								stroke={seriesColor}
								fill={seriesColor}
								strokeWidth={2}
								fillOpacity={0.12}
								dot={false}
								isAnimationActive={false}
							/>
						</AreaChart>
					</ChartContainer>

					<div className="flex flex-col gap-1.5">
						<div className="flex items-baseline justify-between border-b py-1 text-[11px] text-muted-foreground">
							<span className="font-medium">
								{kind === "workspace" ? (
									<Trans>Models used</Trans>
								) : (
									<Trans>Workspaces</Trans>
								)}
							</span>
							<span className="font-medium">
								<Trans>Cost</Trans>
							</span>
						</div>
						{detail.breakdown.slice(0, 8).map((row) => {
							const rowTitle =
								kind === "workspace" ? row.label.split("|")[1] : row.label;
							const linkTarget =
								kind === "workspace"
									? {
											to: "/settings/usage/model/$modelKey" as const,
											params: { modelKey: row.label },
										}
									: history.projectDetails[row.label]
										? {
												to: "/settings/usage/workspace/$workspaceName" as const,
												params: { workspaceName: row.label },
											}
										: null;
							const content = (
								<>
									<div className="flex items-baseline justify-between gap-3 text-[11px]">
										<span className="flex min-w-0 items-center gap-1.5 truncate">
											<span
												className="size-1.5 shrink-0 rounded-[2px]"
												style={{
													background: AGENT_CHART_CONFIG[row.agent]?.color,
												}}
											/>
											{rowTitle}
										</span>
										<span className="flex shrink-0 items-baseline gap-2 tabular-nums">
											<span className="text-muted-foreground">
												{formatTokens(row.tokens)}
											</span>
											<span>{formatUsd(row.usd)}</span>
										</span>
									</div>
									<div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
										<div
											className="h-full rounded-full"
											style={{
												width: `${breakdownMax > 0 ? Math.max(1, (100 * row.usd) / breakdownMax) : 0}%`,
												background: AGENT_CHART_CONFIG[row.agent]?.color,
												opacity: 0.6,
											}}
										/>
									</div>
								</>
							);
							return linkTarget ? (
								<Link
									key={row.label}
									to={linkTarget.to}
									params={linkTarget.params}
									className="flex flex-col gap-0.5 rounded px-1 py-0.5 transition-colors hover:bg-muted/60"
								>
									{content}
								</Link>
							) : (
								<div
									key={row.label}
									className="flex flex-col gap-0.5 px-1 py-0.5"
								>
									{content}
								</div>
							);
						})}
					</div>

					{kind === "workspace" &&
						detail.sessions &&
						detail.sessions.length > 0 && (
							<div className="flex flex-col gap-1.5">
								<div className="flex items-baseline justify-between border-b py-1 text-[11px] text-muted-foreground">
									<span className="font-medium">
										<Trans>
											Sessions · top {detail.sessions.length} by cost
										</Trans>
									</span>
									<span className="font-medium">
										<Trans>Cost</Trans>
									</span>
								</div>
								{detail.sessions.map((session) => {
									const sessionMax = detail.sessions?.[0]?.usd ?? 0;
									const copied = copiedSessionId === session.id;
									return (
										<button
											key={session.id}
											type="button"
											onClick={() => copySessionId(session.id)}
											title={`${session.id}\n${t({
												message:
													"Click to copy the session ID (resume with `claude --resume <id>`).",
											})}`}
											className="group flex flex-col gap-0.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/60"
										>
											<div className="flex items-baseline justify-between gap-3 text-[11px]">
												<span className="flex min-w-0 items-center gap-1.5">
													<span
														className="size-1.5 shrink-0 rounded-[2px]"
														style={{
															background:
																AGENT_CHART_CONFIG[session.agent]?.color,
														}}
													/>
													<span className="truncate">
														{session.label ??
															t({
																message: `Session ${session.id.slice(0, 8)}`,
															})}
													</span>
													<span className="shrink-0 text-muted-foreground">
														{new Date(session.lastMs).toLocaleDateString(
															undefined,
															{ month: "short", day: "numeric" },
														)}
													</span>
													{copied ? (
														<span className="flex shrink-0 items-center gap-1 text-[10px] text-emerald-500">
															<LuCheck className="size-2.5" />
															<Trans>ID copied</Trans>
														</span>
													) : (
														<LuCopy className="size-2.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
													)}
												</span>
												<span className="flex shrink-0 items-baseline gap-2 tabular-nums">
													<span className="text-muted-foreground">
														{formatTokens(session.tokens)}
													</span>
													<span>{formatUsd(session.usd)}</span>
												</span>
											</div>
											<div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
												<div
													className="h-full rounded-full"
													style={{
														width: `${sessionMax > 0 ? Math.max(1, (100 * session.usd) / sessionMax) : 0}%`,
														background:
															AGENT_CHART_CONFIG[session.agent]?.color,
														opacity: 0.6,
													}}
												/>
											</div>
										</button>
									);
								})}
							</div>
						)}
				</>
			)}
		</div>
	);
}
