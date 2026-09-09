"use client";

import { useLingui } from "@lingui/react/macro";
import { formatNumber, formatPercent } from "@superset/i18n/format";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { formatDay } from "../../../utils/chartAxis";
import { useGrowthRange } from "../../providers/GrowthRangeProvider";
import { StatStrip } from "../StatStrip";
import { WeeklyTile } from "../WeeklyTile";

const STALE_TIME_MS = 10 * 60 * 1000;

function rate(numerator: number, denominator: number): string {
	return denominator > 0 ? formatPercent(numerator / denominator) : "–";
}

export function ConversionsTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const { weeks } = useGrowthRange();
	const query = useQuery(
		trpc.growth.conversions.queryOptions(
			{ weeks },
			{ staleTime: STALE_TIME_MS },
		),
	);
	const data = query.data;
	// The current week is partial; quote the last complete one.
	const last = data ? data.weeks.length - 2 : -1;
	const at = (values: number[] | undefined) => values?.[last] ?? 0;
	const visitors = at(data?.visitors);
	const downloaders = at(data?.downloaders);
	const signups = at(data?.signups);
	const teams = at(data?.teams);

	const series = data
		? [
				{
					key: "downloaders",
					label: t({ message: "Download clicks" }),
					values: data.downloaders,
				},
				{
					key: "signups",
					label: t({ message: "New accounts" }),
					values: data.signups,
				},
				{
					key: "teams",
					label: t({ message: "New teams" }),
					values: data.teams,
				},
				{
					key: "waitlist",
					label: t({ message: "Waitlist signups" }),
					values: data.waitlistSignups,
				},
			]
		: [];

	return (
		<WeeklyTile
			title={t({ message: "Visitors to downloads to accounts" })}
			description={t({
				message:
					"Weekly site visitors (PostHog sessions), people who clicked download, accounts created (Neon, company emails excluded), and teams: organizations that gained their second member that week. Rates are for the last complete week.",
			})}
			weeks={data?.weeks ?? []}
			series={series}
			query={data?.query}
			isLoading={query.isLoading}
			error={query.error}
			onRefresh={() => query.refetch()}
			isRefreshing={query.isFetching}
		>
			<StatStrip
				stats={[
					{
						label: t({ message: "Visitors" }),
						value: formatNumber(visitors),
						hint:
							last >= 0
								? t({
										message: `week of ${formatDay(data?.weeks[last] ?? "")}`,
									})
								: undefined,
					},
					{
						label: t({ message: "Download clicks" }),
						value: formatNumber(downloaders),
						hint: t({
							message: `${rate(downloaders, visitors)} of visitors`,
						}),
					},
					{
						label: t({ message: "New accounts" }),
						value: formatNumber(signups),
						hint: t({ message: `${rate(signups, visitors)} of visitors` }),
					},
					{
						label: t({ message: "New teams" }),
						value: formatNumber(teams),
						hint: t({ message: `${rate(teams, signups)} of accounts` }),
					},
				]}
			/>
		</WeeklyTile>
	);
}
