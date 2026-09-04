import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import Link from "next/link";
import { FactoryBackdrop } from "@/app/[lang]/components/FactoryBackdrop";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { fetchStats } from "@/app/[lang]/utils/fetchLeaderboard";
import { formatDayRange } from "@/app/[lang]/utils/formatUsage";
import { initServerI18n } from "@/app/i18n-server";
import { StatsBody } from "./components/StatsBody";
import { Unavailable } from "./components/Unavailable";

const pixel = Silkscreen({
	weight: ["400", "700"],
	subsets: ["latin"],
	display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
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

export const revalidate = 3600;

export default async function StatsPage() {
	await initServerI18n();

	const stats = await fetchStats({ period: "all" });
	const range = stats?.range ? formatDayRange(stats.range) : null;

	return (
		<main className="relative min-h-screen">
			<FactoryBackdrop />

			<div className="relative max-w-4xl mx-auto px-6 py-10 md:py-14">
				<header className="text-center pt-6 md:pt-10">
					<h1
						className={`${pixel.className} text-3xl md:text-4xl text-foreground`}
					>
						<Trans>Stats</Trans>
					</h1>
					<p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground mt-5">
						{range ? (
							<Trans>Site-wide telemetry · {range}</Trans>
						) : (
							<Trans>Site-wide telemetry · all time</Trans>
						)}
					</p>
					<Link
						href="/leaderboard"
						className="inline-block font-mono text-[0.68rem] uppercase tracking-[0.14em] text-brand hover:text-brand-light transition-colors mt-4"
					>
						<Trans>← Back to leaderboard</Trans>
					</Link>
				</header>

				<div className="mt-10 md:mt-12">
					{stats ? (
						<StatsBody stats={stats} pixelClassName={pixel.className} />
					) : (
						<Unavailable />
					)}
				</div>
			</div>
		</main>
	);
}
