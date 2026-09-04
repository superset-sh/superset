import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import type { Metadata } from "next";
import { GridCross } from "@/app/[lang]/blog/components/GridCross";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { formatStarCount, getGitHubRepoSlug } from "@/lib/github";
import { StarChartSection } from "./components/StarChartSection";
import { getStarHistory } from "./utils/getStarHistory";
import {
	aggregateToWeekly,
	computePaceStats,
	computePeriodDeltas,
	formatUTCDate,
} from "./utils/starPace";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const title = i18n._(
		msg({
			message: "Star History",
		}),
	);
	const description = i18n._({
		...msg({
			message: "See how {companyName}'s GitHub stars have grown over time.",
		}),
		values: { companyName: COMPANY.NAME },
	});
	return {
		title,
		description,
		alternates: localizedAlternates(lang, "/starchart"),
		openGraph: {
			title: `${title} | ${COMPANY.NAME}`,
			description,
			url: localeUrl(lang, "/starchart"),
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

function formatWeekDate(date: string): string {
	return formatUTCDate(new Date(date).getTime(), {
		month: "short",
		day: "numeric",
	});
}

export default async function StarChartPage() {
	await initServerI18n();

	const { t } = useLingui();
	const history = await getStarHistory();
	const points = history?.points ?? [];
	const totalStars = history?.totalStars ?? null;
	// Header stats are always weekly, independent of whatever granularity
	// the chart below is currently showing.
	const deltas = computePeriodDeltas(aggregateToWeekly(points));
	const pace = computePaceStats(deltas);
	const repoSlug = getGitHubRepoSlug();
	const starCount = totalStars !== null ? formatStarCount(totalStars) : "";

	const weekOf = (date: string) => {
		const week = formatWeekDate(date);
		return t({ message: `week of ${week}` });
	};

	const perDay = (value: number) => {
		const count = Math.round(value);
		return t({ message: `${count}/day` });
	};

	const projectedThisWeek = (value: number) => {
		const stars = formatStarCount(value);
		return t({
			message: `~${stars} projected this week`,
		});
	};

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
						<Trans>Star History</Trans>
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						{totalStars !== null ? (
							<Trans>{starCount} stars and counting</Trans>
						) : (
							<Trans>Star History</Trans>
						)}
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						<Trans>
							Every star on{" "}
							<span className="font-mono text-foreground">{repoSlug}</span>,
							plotted since launch.
						</Trans>
					</p>

					{(pace.peak || pace.current) && (
						<div className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
							{pace.peak && (
								<div>
									<div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
										<Trans>Peak pace</Trans>
									</div>
									<div className="mt-1 text-lg font-medium text-foreground tabular-nums">
										{perDay(pace.peak.perDay)}
									</div>
									<div className="text-xs text-muted-foreground">
										{weekOf(pace.peak.date)}
									</div>
								</div>
							)}
							{pace.current && (
								<div>
									<div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
										<Trans>Current pace</Trans>
									</div>
									<div className="mt-1 text-lg font-medium text-foreground tabular-nums">
										{perDay(pace.current.perDay)}
									</div>
									<div className="text-xs text-muted-foreground">
										{pace.current.isPartial
											? projectedThisWeek(pace.current.projectedTotal)
											: weekOf(pace.current.date)}
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
							<Trans>Star on GitHub</Trans>
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
						<Trans>
							Star history isn't available right now. Check back soon.
						</Trans>
					</div>
				)}
			</div>
		</main>
	);
}
