import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import type { Metadata } from "next";
import { GridCross } from "@/app/blog/components/GridCross";
import { formatStarCount, getGitHubRepoSlug } from "@/lib/github";
import { StarChartSection } from "./components/StarChartSection";
import { getStarHistory } from "./utils/getStarHistory";
import {
	aggregateToWeekly,
	computePaceStats,
	computePeriodDeltas,
	formatUTCDate,
} from "./utils/starPace";

const TITLE = "Star History";
const DESCRIPTION = `See how ${COMPANY.NAME}'s GitHub stars have grown over time.`;

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: {
		canonical: "/starchart",
	},
	openGraph: {
		title: `${TITLE} | ${COMPANY.NAME}`,
		description: DESCRIPTION,
		url: "/starchart",
		images: ["/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: `${TITLE} | ${COMPANY.NAME}`,
		description: DESCRIPTION,
		images: ["/opengraph-image"],
	},
};

function formatWeekOf(date: string): string {
	return `week of ${formatUTCDate(new Date(date).getTime(), {
		month: "short",
		day: "numeric",
	})}`;
}

export default async function StarChartPage() {
	const history = await getStarHistory();
	const points = history?.points ?? [];
	const totalStars = history?.totalStars ?? null;
	// Header stats are always weekly, independent of whatever granularity
	// the chart below is currently showing.
	const deltas = computePeriodDeltas(aggregateToWeekly(points));
	const pace = computePaceStats(deltas);

	return (
		<main className="relative min-h-screen">
			{/* Vertical guide lines */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					backgroundImage: `
						linear-gradient(to right, transparent 0%, transparent calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 383px), transparent calc(50% - 383px), transparent calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 384px), transparent calc(50% + 384px))
					`,
				}}
			/>

			{/* Header section */}
			<header className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 pt-16 pb-10 md:pt-20 md:pb-12 relative">
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />

					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						Star History
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						{totalStars !== null
							? `${formatStarCount(totalStars)} stars and counting`
							: "Star History"}
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						Every star on{" "}
						<span className="font-mono text-foreground">
							{getGitHubRepoSlug()}
						</span>
						, plotted since launch.
					</p>

					{(pace.peak || pace.current) && (
						<div className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
							{pace.peak && (
								<div>
									<div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
										Peak pace
									</div>
									<div className="mt-1 text-lg font-medium text-foreground tabular-nums">
										{Math.round(pace.peak.perDay)}/day
									</div>
									<div className="text-xs text-muted-foreground">
										{formatWeekOf(pace.peak.date)}
									</div>
								</div>
							)}
							{pace.current && (
								<div>
									<div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
										Current pace
									</div>
									<div className="mt-1 text-lg font-medium text-foreground tabular-nums">
										{Math.round(pace.current.perDay)}/day
									</div>
									<div className="text-xs text-muted-foreground">
										{pace.current.isPartial
											? `~${formatStarCount(pace.current.projectedTotal)} projected this week`
											: formatWeekOf(pace.current.date)}
									</div>
								</div>
							)}
						</div>
					)}

					<Button asChild size="sm" className="mt-6">
						<a
							href={COMPANY.GITHUB_URL}
							target="_blank"
							rel="noopener noreferrer"
						>
							Star on GitHub
						</a>
					</Button>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Content */}
			<div className="relative max-w-5xl mx-auto px-6 py-12 md:py-16">
				{points.length > 1 ? (
					<StarChartSection points={points} />
				) : (
					<div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
						Star history isn't available right now. Check back soon.
					</div>
				)}
			</div>
		</main>
	);
}
