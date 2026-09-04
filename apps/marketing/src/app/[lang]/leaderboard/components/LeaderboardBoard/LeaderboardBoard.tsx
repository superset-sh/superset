"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { StatStrip } from "@/app/[lang]/components/StatStrip";
import { TierTube } from "@/app/[lang]/components/TierTube";
import type {
	LeaderboardMetric,
	LeaderboardStats,
	Standings,
} from "@/app/[lang]/utils/fetchLeaderboard";
import {
	fetchStandings,
	fetchStats,
} from "@/app/[lang]/utils/fetchLeaderboard";
import {
	formatDayRange,
	formatTokens,
	formatUsd,
} from "@/app/[lang]/utils/formatUsage";
import { LeaderboardTable } from "./components/LeaderboardTable";
import { MetricTabs } from "./components/MetricTabs";
import { type RangeSelection, RangeTabs } from "./components/RangeTabs";
import { buildStandingsQuery } from "./utils/buildStandingsQuery";

interface LeaderboardBoardProps {
	initialStandings: Standings | null;
	initialStats: LeaderboardStats | null;
	earliest: string;

	pixelClassName?: string;
}

const PAGE_SIZE = 50;

export function LeaderboardBoard({
	initialStandings,
	initialStats,
	earliest,
	pixelClassName,
}: LeaderboardBoardProps) {
	const { t } = useLingui();
	const [metric, setMetric] = useState<LeaderboardMetric>("tokens");
	const [selection, setSelection] = useState<RangeSelection>({ period: "30d" });
	const [standings, setStandings] = useState(initialStandings);
	const [stats, setStats] = useState(initialStats);
	const [loading, setLoading] = useState(false);
	const [touched, setTouched] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const queryGeneration = useRef(0);

	useEffect(() => {
		if (!touched) return;

		const controller = new AbortController();
		setLoading(true);

		Promise.all([
			fetchStandings(
				{ ...buildStandingsQuery(selection, metric), limit: PAGE_SIZE },
				controller.signal,
			),
			fetchStats(buildStandingsQuery(selection), controller.signal),
		])
			.then(([nextStandings, nextStats]) => {
				if (nextStandings) setStandings(nextStandings);
				if (nextStats) setStats(nextStats);
			})
			.catch(() => {})
			.finally(() => setLoading(false));

		return () => controller.abort();
	}, [metric, selection, touched]);

	const loadMore = async () => {
		if (!standings || loadingMore) return;
		const generation = queryGeneration.current;
		setLoadingMore(true);
		try {
			const next = await fetchStandings({
				...buildStandingsQuery(selection, metric),
				limit: PAGE_SIZE,
				offset: standings.rows.length,
			});
			if (!next || generation !== queryGeneration.current) return;
			setStandings({
				...next,
				rows: [...standings.rows, ...next.rows],
			});
		} finally {
			setLoadingMore(false);
		}
	};

	const update = (
		next: Partial<{ metric: LeaderboardMetric; selection: RangeSelection }>,
	) => {
		queryGeneration.current += 1;
		setTouched(true);
		if (next.metric) setMetric(next.metric);
		if (next.selection) setSelection(next.selection);
	};

	const range = standings?.range ?? null;
	const totals = stats?.totals;
	const shown = standings?.rows.length ?? 0;
	const total = standings?.total ?? 0;

	return (
		<div className="space-y-8">
			<TierTube
				subject="fleet"
				position={stats?.tiers?.position ?? 0}
				counts={stats?.tiers?.distribution}
				pixelClassName={pixelClassName}
			/>

			{totals && (
				<StatStrip
					pixelClassName={pixelClassName}
					stats={[
						{
							label: t({
								message: "Developers",
							}),
							value: String(totals.participants),
						},
						{
							label: t({
								message: "Tokens",
							}),
							value: formatTokens(totals.tokens),
						},
						{
							label: t({
								message: "Cost",
							}),
							value: formatUsd(totals.usd),
							hint: t({
								message: "API-equivalent",
							}),
						},
						{
							label: t({
								message: "Cache read",
							}),
							value: `${
								totals.tokens > 0
									? Math.round(
											((stats?.tokenSplit.cachedInput ?? 0) / totals.tokens) *
												100,
										)
									: 0
							}%`,
							hint: t({
								message: "of all tokens",
							}),
						},
					]}
				/>
			)}

			<div className="flex flex-col items-center gap-4">
				<MetricTabs
					value={metric}
					onChange={(next) => update({ metric: next })}
				/>
				<RangeTabs
					value={selection}
					onChange={(next) => update({ selection: next })}
					earliest={new Date(`${earliest}T00:00:00`)}
					latest={new Date()}
				/>
				<span className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground/70">
					{range ? formatDayRange(range) : <Trans>All time</Trans>}
				</span>
			</div>

			<LeaderboardTable
				rows={standings?.rows ?? []}
				metric={metric}
				isLoading={loading && !standings}
				pixelClassName={pixelClassName}
			/>

			{standings && total > shown && (
				<div className="flex flex-col items-center gap-3">
					<button
						type="button"
						onClick={loadMore}
						disabled={loadingMore}
						className="px-5 py-2 text-xs font-mono uppercase tracking-wider border border-border rounded-[2px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
					>
						{loadingMore ? <Trans>Loading…</Trans> : <Trans>Load more</Trans>}
					</button>
					<span className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground/70">
						<Trans>
							{shown} of {total}
						</Trans>
					</span>
				</div>
			)}
		</div>
	);
}
