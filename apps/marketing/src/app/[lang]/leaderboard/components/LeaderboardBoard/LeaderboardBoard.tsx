"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { StatStrip } from "@/app/[lang]/components/StatStrip";
import { TierTube } from "@/app/[lang]/components/TierTube";
import type {
	LeaderboardMetric,
	LeaderboardStats,
	StandingRow,
	Standings,
} from "@/app/[lang]/utils/fetchLeaderboard";
import {
	fetchSearch,
	fetchStanding,
	fetchStandings,
	fetchStats,
} from "@/app/[lang]/utils/fetchLeaderboard";
import { fetchViewer } from "@/app/[lang]/utils/fetchViewer";
import {
	formatDayRange,
	formatTokens,
	formatUsd,
} from "@/app/[lang]/utils/formatUsage";
import { LeaderboardTable } from "./components/LeaderboardTable";
import { MetricTabs } from "./components/MetricTabs";
import { type RangeSelection, RangeTabs } from "./components/RangeTabs";
import { SearchBox } from "./components/SearchBox";
import { buildStandingsQuery } from "./utils/buildStandingsQuery";

interface LeaderboardBoardProps {
	initialStandings: Standings | null;
	initialStats: LeaderboardStats | null;
	earliest: string;
	header?: React.ReactNode;
	headerLink?: React.ReactNode;

	pixelClassName?: string;
}

const PAGE_SIZE = 50;

export function LeaderboardBoard({
	initialStandings,
	initialStats,
	earliest,
	header,
	headerLink,
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
	const [search, setSearch] = useState("");
	const [viewerHandle, setViewerHandle] = useState<string | null>(null);
	const [pinned, setPinned] = useState<StandingRow | null>(null);

	useEffect(() => {
		const initial = new URLSearchParams(window.location.search).get("q");
		if (initial) setSearch(initial);
	}, []);

	useEffect(() => {
		const url = new URL(window.location.href);
		const term = search.trim();
		if (term) url.searchParams.set("q", term);
		else url.searchParams.delete("q");
		window.history.replaceState(null, "", url);
	}, [search]);
	const [results, setResults] = useState<StandingRow[] | null>(null);
	const [searching, setSearching] = useState(false);
	const queryGeneration = useRef(0);

	useEffect(() => {
		const term = search.trim();
		if (term.length === 0) {
			setResults(null);
			setSearching(false);
			return;
		}

		const controller = new AbortController();
		setResults(null);
		setSearching(true);
		const timer = setTimeout(() => {
			fetchSearch(
				term,
				buildStandingsQuery(selection, metric),
				controller.signal,
			)
				.then((rows) => {
					if (!controller.signal.aborted) setResults(rows);
				})
				.finally(() => {
					if (!controller.signal.aborted) setSearching(false);
				});
		}, 200);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	}, [search, selection, metric]);

	useEffect(() => {
		let live = true;
		fetchViewer().then((viewer) => {
			if (live) setViewerHandle(viewer?.handle ?? null);
		});
		return () => {
			live = false;
		};
	}, []);

	const loadedRows = standings?.rows;
	const onScreen =
		!!viewerHandle && !!loadedRows?.some((row) => row.handle === viewerHandle);

	useEffect(() => {
		if (!viewerHandle || onScreen) {
			setPinned(null);
			return;
		}

		const controller = new AbortController();
		fetchStanding(
			viewerHandle,
			buildStandingsQuery(selection, metric),
			controller.signal,
		).then((row) => {
			if (!controller.signal.aborted) setPinned(row);
		});

		return () => controller.abort();
	}, [viewerHandle, onScreen, selection, metric]);

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
			<div className="flex items-center justify-between gap-4">
				<SearchBox value={search} onChange={setSearch} busy={searching} />
				{headerLink}
			</div>

			{header}

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
				rows={results ?? standings?.rows ?? []}
				metric={metric}
				isLoading={results === null && loading && !standings}
				emptyReason={results !== null ? "search" : "board"}
				pixelClassName={pixelClassName}
				viewerHandle={viewerHandle}
				pinnedRow={results === null ? pinned : null}
			/>

			{results === null && standings && total > shown && (
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
