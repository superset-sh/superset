import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import Link from "next/link";
import { FactoryBackdrop } from "@/app/components/FactoryBackdrop";
import { fetchStandings, fetchStats } from "@/app/utils/fetchLeaderboard";
import { LeaderboardBoard } from "./components/LeaderboardBoard";

const pixel = Silkscreen({
	weight: ["400", "700"],
	subsets: ["latin"],
	display: "swap",
});

const TITLE = "Leaderboard";
const DESCRIPTION =
	"How much agent work engineers are actually running — tokens, cost, models and sessions, published by people who opted in.";

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: "/leaderboard" },
	openGraph: {
		title: `${TITLE} | ${COMPANY.NAME}`,
		description: DESCRIPTION,
		url: "/leaderboard",
		images: ["/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: `${TITLE} | ${COMPANY.NAME}`,
		description: DESCRIPTION,
		images: ["/opengraph-image"],
	},
};

export const revalidate = 300;

const DEFAULT_PERIOD = "30d" as const;

export default async function LeaderboardPage() {
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
						Leaderboard
					</h1>
					<p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground mt-5">
						Agent usage, ranked
					</p>
					<Link
						href="/stats"
						className="inline-block font-mono text-[0.68rem] uppercase tracking-[0.14em] text-brand hover:text-brand-light transition-colors mt-4"
					>
						See all stats →
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
