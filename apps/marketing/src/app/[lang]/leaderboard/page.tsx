import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { LeaderboardHeader } from "@/app/[lang]/components/LeaderboardHeader";
import { LeaderboardLayout } from "@/app/[lang]/components/LeaderboardLayout";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import {
	fetchStandings,
	fetchStats,
} from "@/app/[lang]/utils/fetchLeaderboard";
import { initServerI18n } from "@/app/i18n-server";
import { LeaderboardBoard } from "./components/LeaderboardBoard";
import { LeaderboardJoin } from "./components/LeaderboardJoin";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	const title = i18n._(
		msg({
			message: "Leaderboard",
		}),
	);
	const description = i18n._(
		msg({
			message:
				"How much agent work engineers are actually running — tokens, cost, models and sessions, published by people who opted in.",
		}),
	);
	return {
		title,
		description,
		alternates: localizedAlternates(lang, "/leaderboard"),
		openGraph: {
			title: `${title} | ${COMPANY.NAME}`,
			description,
			url: localeUrl(lang, "/leaderboard"),
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

export default async function LeaderboardPage() {
	await connection();
	await initServerI18n();
	const [standings, stats] = await Promise.all([
		fetchStandings({ period: "30d", metric: "tokens", limit: 50 }),
		fetchStats({ period: "30d" }),
	]);
	return (
		<LeaderboardLayout>
			<LeaderboardBoard
				initialStandings={standings}
				initialStats={stats}
				earliest="2025-01-01"
				header={
					<LeaderboardHeader
						title={<Trans>Leaderboard</Trans>}
						description={
							<Trans>
								See how your agent usage compares. Explore the models behind
								each profile.
							</Trans>
						}
						actions={<LeaderboardJoin />}
						navigation={
							<div className="flex flex-wrap items-center gap-x-6">
								<Link
									href="/stats"
									className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
								>
									<Trans>See all stats →</Trans>
								</Link>

								<Link
									href="/the-production-run"
									className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
								>
									<Trans>How tiers work →</Trans>
								</Link>
							</div>
						}
					/>
				}
			/>
		</LeaderboardLayout>
	);
}
