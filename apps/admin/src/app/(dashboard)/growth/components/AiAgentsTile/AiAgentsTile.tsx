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

export function AiAgentsTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const { days } = useGrowthRange();
	const query = useQuery(
		trpc.growth.aiAgents.queryOptions({ days }, { staleTime: STALE_TIME_MS }),
	);
	const rows = query.data?.rows ?? [];
	const dayCount = formatNumber(days);

	return (
		<InsightTileFrame
			title={t`AI agents reading the site, last ${dayCount} days`}
			description={t({
				message:
					"Assistants that opened our pages in a real browser on someone's behalf. Crawlers that only fetch HTML never run analytics and are not counted.",
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
					{ key: "bot", label: t({ message: "Agent" }) },
					{
						key: "pageviews",
						label: t({ message: "Page views" }),
						align: "right",
					},
				]}
				rows={rows.map((row) => ({
					id: row.bot,
					cells: { bot: row.bot, pageviews: formatNumber(row.pageviews) },
				}))}
			/>
		</InsightTileFrame>
	);
}
