"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { formatStarCount } from "@superset/shared/github-stars";
import {
	aggregateToWeekly,
	computePaceStats,
	computePeriodDeltas,
	StarChart,
} from "@superset/ui/star-chart";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { InsightTileFrame } from "../InsightTileFrame";

// The procedure caches the stargazer walk for six hours, so this only decides
// how often an open tab re-asks for it.
const STALE_TIME_MS = 30 * 60 * 1000;

export function StarHistoryTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const query = useQuery(
		trpc.growth.starHistory.queryOptions(undefined, {
			staleTime: STALE_TIME_MS,
		}),
	);
	const data = query.data?.available ? query.data : null;
	const unavailableReason =
		query.data && !query.data.available ? query.data.reason : null;

	const points = data?.points ?? [];
	// Header pace is always weekly, whichever granularity the chart is showing.
	const pace = computePaceStats(computePeriodDeltas(aggregateToWeekly(points)));
	const stars = formatStarCount(data?.totalStars ?? 0);
	const perDay = pace.current ? Math.round(pace.current.perDay) : 0;
	const peakPerDay = pace.peak ? Math.round(pace.peak.perDay) : 0;

	return (
		<InsightTileFrame
			title={t({ message: "GitHub stars" })}
			// Zeros until the walk lands would read as a real answer.
			description={
				data ? (
					<Trans>
						{stars} stars · {perDay}/day this week · {peakPerDay}/day at peak
					</Trans>
				) : undefined
			}
			lastRefresh={data?.fetchedAt}
			isLoading={query.isLoading}
			error={query.error}
			onRefresh={() => query.refetch()}
			isRefreshing={query.isFetching}
			empty={points.length === 0}
			emptyLabel={
				unavailableReason
					? t({ message: `Unavailable: ${unavailableReason}` })
					: undefined
			}
			href={`${COMPANY.MARKETING_URL}/starchart`}
		>
			<StarChart points={points} />
		</InsightTileFrame>
	);
}
