import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import Link from "next/link";
import { FactoryBackdrop } from "@/app/components/FactoryBackdrop";
import { fetchStats } from "@/app/utils/fetchLeaderboard";
import { formatDayRange } from "@/app/utils/formatUsage";
import { StatsBody } from "./components/StatsBody";
import { Unavailable } from "./components/Unavailable";

const pixel = Silkscreen({
	weight: ["400", "700"],
	subsets: ["latin"],
	display: "swap",
});

const TITLE = "Stats";
const DESCRIPTION =
	"Aggregate agent usage across every developer on the Superset leaderboard — tokens, cost, cache behaviour and which models people actually reach for.";

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: "/stats" },
	openGraph: {
		title: `${TITLE} | ${COMPANY.NAME}`,
		description: DESCRIPTION,
		url: "/stats",
		images: ["/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: `${TITLE} | ${COMPANY.NAME}`,
		description: DESCRIPTION,
		images: ["/opengraph-image"],
	},
};

export const revalidate = 3600;

export default async function StatsPage() {
	const stats = await fetchStats({ period: "all" });

	return (
		<main className="relative min-h-screen">
			<FactoryBackdrop />

			<div className="relative max-w-4xl mx-auto px-6 py-10 md:py-14">
				<header className="text-center pt-6 md:pt-10">
					<h1
						className={`${pixel.className} text-3xl md:text-4xl text-foreground`}
					>
						Stats
					</h1>
					<p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground mt-5">
						Site-wide telemetry
						{stats?.range ? ` · ${formatDayRange(stats.range)}` : " · all time"}
					</p>
					<Link
						href="/leaderboard"
						className="inline-block font-mono text-[0.68rem] uppercase tracking-[0.14em] text-brand hover:text-brand-light transition-colors mt-4"
					>
						← Back to leaderboard
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
