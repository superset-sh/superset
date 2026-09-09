"use client";

import { useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { COMPANY } from "@superset/shared/constants";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { InsightTileFrame } from "../../../components/InsightTileFrame";
import { formatDay } from "../../../utils/chartAxis";
import { RankedTable } from "../RankedTable";
import { StatStrip } from "../StatStrip";

const STALE_TIME_MS = 30 * 60 * 1000;

export function GithubTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const query = useQuery(
		trpc.growth.github.queryOptions(undefined, { staleTime: STALE_TIME_MS }),
	);
	const data = query.data?.available ? query.data : null;
	const unavailableReason =
		query.data && !query.data.available ? query.data.reason : null;

	return (
		<InsightTileFrame
			title={t({ message: "GitHub" })}
			description={t({
				message:
					"Repository reach and desktop release downloads. Installs are dmg and AppImage downloads; updates are the zip the auto-updater pulls, so they count existing users.",
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
			href={COMPANY.GITHUB_URL}
			fill
		>
			<div className="space-y-4">
				<StatStrip
					stats={[
						{
							label: t({ message: "Stars" }),
							value: formatNumber(data?.stars ?? 0),
						},
						{
							label: t({ message: "Forks" }),
							value: formatNumber(data?.forks ?? 0),
						},
						{
							label: t({ message: "Watchers" }),
							value: formatNumber(data?.watchers ?? 0),
						},
						{
							label: t({ message: "Open issues" }),
							value: formatNumber(data?.openIssues ?? 0),
						},
					]}
				/>
				<RankedTable
					columns={[
						{ key: "version", label: t({ message: "Release" }) },
						{ key: "date", label: t({ message: "Published" }) },
						{
							key: "installs",
							label: t({ message: "Installs" }),
							align: "right",
						},
						{
							key: "updates",
							label: t({ message: "Updates" }),
							align: "right",
						},
					]}
					rows={(data?.releases ?? []).map((release) => ({
						id: release.version,
						cells: {
							version: release.version,
							date: release.publishedAt ? formatDay(release.publishedAt) : "",
							installs: formatNumber(release.installs),
							updates: formatNumber(release.updates),
						},
					}))}
				/>
			</div>
		</InsightTileFrame>
	);
}
