"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
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
import { formatDayRange } from "@/app/[lang]/utils/formatUsage";
import { LeaderboardSummary } from "./components/LeaderboardSummary";
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
	const { i18n } = useLingui();
	const [metric, setMetric] = useState<LeaderboardMetric>("tokens");
	const [selection, setSelection] = useState<RangeSelection>({ period: "30d" });
	const [standings, setStandings] = useState(initialStandings);
	const [stats, setStats] = useState(initialStats);
	const [loading, setLoading] = useState(false);
	const [touched, setTouched] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [loadMoreError, setLoadMoreError] = useState(false);
	const [error, setError] = useState(!initialStandings);
	const [searchError, setSearchError] = useState(false);
	const [searchAttempt, setSearchAttempt] = useState(0);
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
		window.history.replaceState(window.history.state, "", url);
	}, [search]);
	const [results, setResults] = useState<StandingRow[] | null>(null);
	const [searching, setSearching] = useState(false);
	const queryGeneration = useRef(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Retry the same query when searchAttempt changes.
	useEffect(() => {
		const term = search.trim();
		if (term.length === 0) {
			setResults(null);
			setSearchError(false);
			setSearching(false);
			return;
		}

		const controller = new AbortController();
		setResults(null);
		setSearchError(false);
		setSearching(true);
		const timer = setTimeout(() => {
			fetchSearch(
				term,
				buildStandingsQuery(selection, metric),
				controller.signal,
			)
				.then((rows) => {
					if (controller.signal.aborted) return;
					setSearchError(rows === null);
					setResults(rows);
				})
				.finally(() => {
					if (!controller.signal.aborted) setSearching(false);
				});
		}, 200);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	}, [search, selection, metric, searchAttempt]);

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
		setError(false);
		setStandings(null);

		Promise.all([
			fetchStandings(
				{ ...buildStandingsQuery(selection, metric), limit: PAGE_SIZE },
				controller.signal,
			),
			fetchStats(buildStandingsQuery(selection), controller.signal),
		])
			.then(([nextStandings, nextStats]) => {
				if (controller.signal.aborted) return;
				setError(nextStandings === null);
				setStandings(nextStandings);
				setStats(nextStats);
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});

		return () => controller.abort();
	}, [metric, selection, touched]);

	const loadMore = async () => {
		if (!standings || loadingMore || loading) return;
		const generation = queryGeneration.current;
		setLoadingMore(true);
		setLoadMoreError(false);
		try {
			const next = await fetchStandings({
				...buildStandingsQuery(selection, metric),
				limit: PAGE_SIZE,
				offset: standings.rows.length,
			});
			if (generation !== queryGeneration.current) return;
			if (!next) {
				setLoadMoreError(true);
				return;
			}
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
		setLoadMoreError(false);
		setTouched(true);
		if (next.metric) setMetric(next.metric);
		if (next.selection) setSelection(next.selection);
	};

	const searchingByName = search.trim().length > 0;
	const hasError = searchingByName ? searchError : error;
	const range = standings?.range ?? null;
	const shown = standings?.rows.length ?? 0;
	const total = standings?.total ?? 0;

	return (
		<div className="space-y-6">
			{header}

			{stats && <LeaderboardSummary stats={stats} loading={loading} />}

			<div className="space-y-3 rounded-[2px] border border-border bg-foreground/[0.02] p-3 sm:p-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
				</div>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<SearchBox value={search} onChange={setSearch} busy={searching} />
					<span className="text-xs text-muted-foreground">
						{loading ? (
							<Trans>Loading…</Trans>
						) : range ? (
							formatDayRange(range, i18n.locale)
						) : standings ? (
							<Trans>All time</Trans>
						) : null}
					</span>
				</div>
			</div>
			{hasError ? (
				<div
					role="alert"
					className="border border-border p-8 text-center space-y-4"
				>
					<p>
						<Trans>Something went wrong</Trans>
					</p>
					<button
						type="button"
						onClick={() => {
							if (searchingByName) {
								setSearchAttempt((attempt) => attempt + 1);
								return;
							}
							setTouched(true);
							setSelection((value) => ({ ...value }));
						}}
						className="min-h-11 border border-border px-5 text-sm text-brand hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
					>
						<Trans>Try again</Trans>
					</button>
				</div>
			) : (
				<LeaderboardTable
					rows={searchingByName ? (results ?? []) : (standings?.rows ?? [])}
					metric={metric}
					isLoading={searchingByName ? searching || results === null : loading}
					emptyReason={searchingByName ? "search" : "board"}
					onClearSearch={() => setSearch("")}
					pixelClassName={pixelClassName}
					viewerHandle={viewerHandle}
					pinnedRow={!searchingByName && !loading ? pinned : null}
				/>
			)}

			{!searchingByName &&
				!hasError &&
				!loading &&
				standings &&
				total > shown && (
					<div className="flex flex-col items-center gap-3">
						{loadMoreError && (
							<p role="alert" className="text-sm text-muted-foreground">
								<Trans>Something went wrong</Trans>
							</p>
						)}
						<button
							type="button"
							onClick={loadMore}
							disabled={loadingMore || loading}
							className="px-5 py-2 text-xs font-mono uppercase tracking-wider border border-border rounded-[2px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
						>
							{loadingMore ? (
								<Trans>Loading…</Trans>
							) : loadMoreError ? (
								<Trans>Try again</Trans>
							) : (
								<Trans>Load more</Trans>
							)}
						</button>
						<span className="text-xs text-muted-foreground">
							<Trans>
								{shown} of {total}
							</Trans>
						</span>
					</div>
				)}
			{stats && (
				<details className="group rounded-[2px] border border-border bg-background">
					<summary className="cursor-pointer px-4 py-3 min-h-11 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand">
						<Trans>Tier</Trans>
					</summary>
					<div className="px-4 pb-4 space-y-4">
						<TierTube
							subject="fleet"
							position={stats.tiers?.position ?? 0}
							counts={stats.tiers?.distribution}
							pixelClassName={pixelClassName}
						/>
						{headerLink}
					</div>
				</details>
			)}
		</div>
	);
}
