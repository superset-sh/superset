"use client";

import { useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { InsightTileFrame } from "../../../components/InsightTileFrame";
import { useGrowthRange } from "../../providers/GrowthRangeProvider";
import { PostHogQueryLink } from "../PostHogQueryLink";
import { RankedTable } from "../RankedTable";

const STALE_TIME_MS = 10 * 60 * 1000;

export function TopReferrersTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const { days } = useGrowthRange();
	const query = useQuery(
		trpc.growth.topReferrers.queryOptions(
			{ days },
			{ staleTime: STALE_TIME_MS },
		),
	);
	const rows = query.data?.rows ?? [];
	const dayCount = formatNumber(days);

	return (
		<InsightTileFrame
			title={t`Top referring sites, last ${dayCount} days`}
			description={t({
				message:
					"Directories, blogs, newsletters, and communities that sent visitors. Search, social, GitHub, and assistants are excluded so listings and links stand out.",
			})}
			isLoading={query.isLoading}
			error={query.error}
			onRefresh={() => query.refetch()}
			isRefreshing={query.isFetching}
			empty={rows.length === 0}
			fill
			headerAction={<PostHogQueryLink query={query.data?.query} />}
		>
			<RankedTable
				columns={[
					{ key: "domain", label: t({ message: "Site" }) },
					{
						key: "visitors",
						label: t({ message: "Visitors" }),
						align: "right",
					},
					{
						key: "sessions",
						label: t({ message: "Sessions" }),
						align: "right",
					},
				]}
				rows={rows.map((row) => ({
					id: row.domain,
					cells: {
						domain: (
							<a
								href={`https://${row.domain}`}
								target="_blank"
								rel="noreferrer"
								className="hover:underline"
							>
								{row.domain}
							</a>
						),
						visitors: formatNumber(row.visitors),
						sessions: formatNumber(row.sessions),
					},
				}))}
			/>
		</InsightTileFrame>
	);
}
