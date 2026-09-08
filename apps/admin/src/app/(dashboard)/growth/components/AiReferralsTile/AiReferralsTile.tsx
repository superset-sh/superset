"use client";

import { useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { useGrowthRange } from "../../providers/GrowthRangeProvider";
import { WeeklyTile } from "../WeeklyTile";

const STALE_TIME_MS = 10 * 60 * 1000;

export function AiReferralsTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const { weeks } = useGrowthRange();
	const query = useQuery(
		trpc.growth.aiReferrals.queryOptions(
			{ weeks },
			{ staleTime: STALE_TIME_MS },
		),
	);
	const series = (query.data?.series ?? []).map((s) => ({
		...s,
		label: s.key === "other" ? t({ message: "Other" }) : s.key,
	}));
	// The last bucket is the current, partial week; the one before it is the
	// most recent number worth quoting.
	const weekCount = query.data?.weeks.length ?? 0;
	const lastFullWeek = series.reduce(
		(sum, s) => sum + (s.values[weekCount - 2] ?? 0),
		0,
	);

	return (
		<WeeklyTile
			title={t({ message: "AI assistant referrals" })}
			description={t({
				message:
					"Visitors whose session began on a link an assistant gave them. This is the number an AEO effort should move.",
			})}
			weeks={query.data?.weeks ?? []}
			series={series}
			query={query.data?.query}
			isLoading={query.isLoading}
			error={query.error}
			onRefresh={() => query.refetch()}
			isRefreshing={query.isFetching}
			headerAction={
				weekCount > 1 ? (
					<span className="text-muted-foreground text-xs">
						{t({ message: `${formatNumber(lastFullWeek)} last full week` })}
					</span>
				) : null
			}
		/>
	);
}
