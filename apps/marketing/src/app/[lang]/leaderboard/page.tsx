import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import Link from "next/link";
import { FactoryBackdrop } from "@/app/[lang]/components/FactoryBackdrop";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import {
	fetchStandings,
	fetchStats,
} from "@/app/[lang]/utils/fetchLeaderboard";
import { initServerI18n } from "@/app/i18n-server";
import { LeaderboardBoard } from "./components/LeaderboardBoard";

const pixel = Silkscreen({
	weight: ["400", "700"],
	subsets: ["latin"],
	display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const title = i18n._({
		id: "marketing.meta.leaderboard.title",
		message: "Leaderboard",
	});
	const description = i18n._({
		id: "marketing.meta.leaderboard.description",
		message:
			"How much agent work engineers are actually running — tokens, cost, models and sessions, published by people who opted in.",
	});
	return {
		title,
		description,
		alternates: localizedAlternates(lang, "/leaderboard"),
		openGraph: {
			title: `${title} | ${COMPANY.NAME}`,
			description,
			url: localeUrl(lang, "/leaderboard"),
			images: ["/opengraph-image"],
		},
		twitter: {
			card: "summary_large_image",
			title: `${title} | ${COMPANY.NAME}`,
			description,
			images: ["/opengraph-image"],
		},
	};
}

export const revalidate = 300;

const DEFAULT_PERIOD = "30d" as const;

export default async function LeaderboardPage() {
	await initServerI18n();

	const [standings, stats] = await Promise.all([
		fetchStandings({ period: DEFAULT_PERIOD, metric: "tokens", limit: 50 }),
		fetchStats({ period: DEFAULT_PERIOD }),
	]);

	return (
		<main className="relative min-h-screen">
			<FactoryBackdrop />

			<div className="relative max-w-4xl mx-auto px-6 py-10 md:py-14">
				<header className="text-center pt-6 md:pt-10">
					<h1
						className={`${pixel.className} text-3xl md:text-4xl text-foreground`}
					>
						<Trans id="marketing.leaderboard.title">Leaderboard</Trans>
					</h1>
					<p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground mt-5">
						<Trans id="marketing.leaderboard.tagline">
							Agent usage, ranked
						</Trans>
					</p>
					<Link
						href="/stats"
						className="inline-block font-mono text-[0.68rem] uppercase tracking-[0.14em] text-brand hover:text-brand-light transition-colors mt-4"
					>
						<Trans id="marketing.leaderboard.seeAllStats">
							See all stats →
						</Trans>
					</Link>
				</header>

				<div className="mt-10 md:mt-12">
					<LeaderboardBoard
						initialStandings={standings}
						initialStats={stats}
						earliest="2025-01-01"
						pixelClassName={pixel.className}
					/>
				</div>
			</div>
		</main>
	);
}
