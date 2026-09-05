"use client";

import { useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { COMPANY } from "@superset/shared/constants";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { InsightTileFrame } from "../../../components/InsightTileFrame";
import { StatStrip } from "../StatStrip";

const STALE_TIME_MS = 30 * 60 * 1000;

export function DiscordTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const query = useQuery(
		trpc.growth.discord.queryOptions(undefined, { staleTime: STALE_TIME_MS }),
	);
	const data = query.data?.available ? query.data : null;
	const unavailableReason =
		query.data && !query.data.available ? query.data.reason : null;

	return (
		<InsightTileFrame
			title={t({ message: "Discord" })}
			description={t({
				message:
					"Community size from the public invite, refreshed every half hour.",
			})}
			lastRefresh={data?.fetchedAt}
			isLoading={query.isLoading}
			error={query.error}
			onRefresh={() => query.refetch()}
			isRefreshing={query.isFetching}
			empty={!data}
			emptyLabel={
				unavailableReason
					? t({ message: `Unavailable: ${unavailableReason}` })
					: undefined
			}
			href={COMPANY.DISCORD_URL}
			fill
		>
			<StatStrip
				stats={[
					{
						label: t({ message: "Members" }),
						value: formatNumber(data?.members ?? 0),
					},
					{
						label: t({ message: "Online now" }),
						value: formatNumber(data?.online ?? 0),
					},
				]}
			/>
		</InsightTileFrame>
	);
}
