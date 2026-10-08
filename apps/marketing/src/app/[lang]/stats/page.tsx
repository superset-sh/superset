import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { connection } from "next/server";
import { LeaderboardBackLink } from "@/app/[lang]/components/LeaderboardBackLink";
import { LeaderboardHeader } from "@/app/[lang]/components/LeaderboardHeader";
import { LeaderboardLayout } from "@/app/[lang]/components/LeaderboardLayout";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { fetchStats } from "@/app/[lang]/utils/fetchLeaderboard";
import { formatDayRange } from "@/app/[lang]/utils/formatUsage";
import { initServerI18n } from "@/app/i18n-server";
import { StatsBody } from "./components/StatsBody";
import { Unavailable } from "./components/Unavailable";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	const title = i18n._(
		msg({
			message: "Stats",
		}),
	);
	const description = i18n._(
		msg({
			message:
				"Aggregate agent usage across every developer on the Superset leaderboard — tokens, cost, cache behaviour and which models people actually reach for.",
		}),
	);
	return {
		title,
		description,
		alternates: localizedAlternates(lang, "/stats"),
		openGraph: {
			title: `${title} | ${COMPANY.NAME}`,
			description,
			url: localeUrl(lang, "/stats"),
			images: ["/og-image.png"],
		},
		twitter: {
			card: "summary_large_image",
			title: `${title} | ${COMPANY.NAME}`,
			description,
			images: ["/og-image.png"],
		},
	};
}

export const instant = false;

export default async function StatsPage() {
	await connection();
	const locale = await initServerI18n();

	const stats = await fetchStats({ period: "all" });
	const range = stats?.range ? formatDayRange(stats.range, locale) : null;

	return (
		<LeaderboardLayout>
			<LeaderboardHeader
				title={<Trans>Stats</Trans>}
				description={
					range ? (
						<Trans>Site-wide telemetry · {range}</Trans>
					) : (
						<Trans>Site-wide telemetry · all time</Trans>
					)
				}
				navigation={<LeaderboardBackLink />}
			/>

			<div className="mt-6">
				{stats ? <StatsBody stats={stats} /> : <Unavailable />}
			</div>
		</LeaderboardLayout>
	);
}
