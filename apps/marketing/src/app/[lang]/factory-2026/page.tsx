import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { GridCross } from "@/app/[lang]/blog/components/GridCross";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { AttentionChart } from "./components/AttentionChart";
import { ForecastChart } from "./components/ForecastChart";
import { ForecastEntry } from "./components/ForecastEntry";
import { GateScorecard } from "./components/GateScorecard";
import { GatesSummary } from "./components/GatesSummary";
import { HeroStats } from "./components/HeroStats";
import { LevelCard } from "./components/LevelCard";
import { ProgressSidebar } from "./components/ProgressSidebar";
import { FACTORY_LEVELS, FORECAST_PERIODS, GATE_SCORECARD } from "./constants";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const title = i18n._(
		msg({
			message: "Factory 2026",
		}),
	);
	const description = i18n._(
		msg({
			message:
				"A falsifiable rubric for the self-driving software factory: six levels of autonomy, the measurable gates between them, and a forecast for how far 2026 gets us.",
		}),
	);
	return {
		title,
		description,
		alternates: localizedAlternates(lang, "/factory-2026"),
		openGraph: {
			title: i18n._(
				msg({
					message: "Factory 2026 | Superset",
				}),
			),
			description,
			url: localeUrl(lang, "/factory-2026"),
			images: ["/opengraph-image"],
		},
		twitter: {
			card: "summary_large_image",
			title: i18n._(
				msg({
					message: "Factory 2026 | Superset",
				}),
			),
			description,
			images: ["/opengraph-image"],
		},
	};
}

export default async function Factory2026Page() {
	await initServerI18n();

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

			{/* Hero */}
			<header className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 pt-16 pb-10 md:pt-20 md:pb-12 relative">
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />

					<span className="inline-flex items-center gap-2 text-xs font-mono text-muted-foreground border border-border rounded-[2px] px-3 py-1.5 bg-foreground/[0.03]">
						<span className="text-brand shrink-0">●</span>
						<Trans>Forecast · Published August 2026</Trans>
					</span>
					<h1 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight text-foreground mt-6">
						<Trans>The self-driving software factory</Trans>
					</h1>
					<p className="text-muted-foreground mt-4 leading-relaxed">
						<Trans>
							Six levels of factory autonomy, the gates between them, and our
							forecast for how far 2026 gets us. Written down now so you can
							grade us later.
						</Trans>
					</p>
					<p className="text-muted-foreground mt-4 leading-relaxed">
						<Trans>
							Predictions about AI are cheap because nobody checks them. This
							page is a rubric, not a vibe: every gate below is either true or
							false of a real team shipping real software. We update it as gates
							open, and we do not move the goalposts.
						</Trans>
					</p>

					<HeroStats />

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			<ProgressSidebar />

			{/* Levels */}
			<section
				id="rubric"
				className="relative scroll-mt-24 border-b border-border"
			>
				<div className="max-w-3xl mx-auto px-6 py-16 relative">
					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />

					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						<Trans>The rubric</Trans>
					</span>
					<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground mt-4">
						<Trans>Six levels of factory autonomy</Trans>
					</h2>
					<p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
						<Trans>
							Borrowed from how self-driving cars are graded, applied to how
							software gets built. The interesting jump is F3 to F4: from agents
							you delegate to, to a factory you direct.
						</Trans>
					</p>

					<div className="mt-10">
						<AttentionChart />
					</div>

					<div className="mt-10 flex flex-col gap-4">
						{FACTORY_LEVELS.map((level) => (
							<LevelCard key={level.id} level={level} />
						))}
					</div>
				</div>
			</section>

			{/* Forecast timeline */}
			<section
				id="forecast"
				className="relative scroll-mt-24 border-b border-border"
			>
				<div className="max-w-3xl mx-auto px-6 py-16 relative">
					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />

					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						<Trans>The forecast</Trans>
					</span>
					<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground mt-4">
						<Trans>How 2026 plays out</Trans>
					</h2>
					<p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
						<Trans>
							Part record, part bet. The first two entries are already
							happening. The rest is stated concretely enough to be wrong about.
						</Trans>
					</p>

					<div className="mt-10">
						<ForecastChart />
					</div>

					<div className="mt-12 flex flex-col gap-16">
						{FORECAST_PERIODS.map((entry) => (
							<ForecastEntry key={entry.id} entry={entry} />
						))}
					</div>

					<div className="mt-16 border border-border p-6 md:p-8">
						<span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
							<Trans>Beyond: F5 is not a near-term claim</Trans>
						</span>
						<p className="text-muted-foreground mt-3 leading-relaxed">
							<Trans>
								We do not forecast full self-driving in 2026 or 2027. The honest
								unknowns: whether agent review holds up against adversarial
								complexity, whether specification can replace code reading as
								the trust anchor at scale, and whether compute economics keep
								the overnight shift cheaper than the humans it augments. F5 is a
								rubric entry so we recognize it when we see it, not a promise.
							</Trans>
						</p>
					</div>
				</div>
			</section>

			{/* Scorecard */}
			<section
				id="scorecard"
				className="relative scroll-mt-24 border-b border-border"
			>
				<div className="max-w-3xl mx-auto px-6 py-16 relative">
					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />

					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						<Trans>The scorecard</Trans>
					</span>
					<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground mt-4">
						<Trans>Where the industry is, honestly</Trans>
					</h2>
					<p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
						<Trans>
							Our read as of August 2026, based on our own team and the teams we
							watch closely. F3 is mostly open. F4 is mostly closed. That gap is
							the work.
						</Trans>
					</p>

					<div className="mt-10">
						<GatesSummary scores={GATE_SCORECARD} />
					</div>

					<div className="mt-8">
						<GateScorecard scores={GATE_SCORECARD} />
					</div>
				</div>
			</section>

			{/* CTA */}
			<section className="relative">
				<div className="max-w-3xl mx-auto px-6 py-16 md:py-20 relative text-center">
					<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground">
						<Trans>The factory needs a floor</Trans>
					</h2>
					<p className="text-muted-foreground mt-3 max-w-lg mx-auto leading-relaxed">
						<Trans>
							Superset is the workbench for the F3 to F4 transition: parallel
							agents in isolated workspaces, fleets you can actually supervise,
							and a review surface for code you did not write.
						</Trans>
					</p>
					<div className="mt-8 flex items-center justify-center gap-4">
						<Link
							href="/download"
							className="bg-foreground text-background px-6 py-3 text-sm font-normal transition-colors hover:bg-brand hover:text-white"
						>
							<Trans>Download Superset</Trans>
						</Link>
						<Link
							href="/changelog"
							className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
						>
							<Trans>Read the changelog</Trans>
							<span className="transition-transform group-hover:translate-x-0.5">
								→
							</span>
						</Link>
					</div>
				</div>
			</section>
		</main>
	);
}
