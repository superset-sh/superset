import type { Metadata } from "next";
import Link from "next/link";
import { GridCross } from "@/app/blog/components/GridCross";
import { AttentionChart } from "./components/AttentionChart";
import { ForecastChart } from "./components/ForecastChart";
import { ForecastEntry } from "./components/ForecastEntry";
import { GateScorecard } from "./components/GateScorecard";
import { GatesSummary } from "./components/GatesSummary";
import { HeroStats } from "./components/HeroStats";
import { LevelCard } from "./components/LevelCard";
import { ProgressSidebar } from "./components/ProgressSidebar";
import { FACTORY_LEVELS, FORECAST_PERIODS, GATE_SCORECARD } from "./constants";

const DESCRIPTION =
	"A falsifiable rubric for the self-driving software factory: six levels of autonomy, the measurable gates between them, and a forecast for how far 2026 gets us.";

export const metadata: Metadata = {
	title: "Factory 2026",
	description: DESCRIPTION,
	alternates: {
		canonical: "/factory-2026",
	},
	openGraph: {
		title: "Factory 2026 | Superset",
		description: DESCRIPTION,
		url: "/factory-2026",
		images: ["/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: "Factory 2026 | Superset",
		description: DESCRIPTION,
		images: ["/opengraph-image"],
	},
};

export default function Factory2026Page() {
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
						Forecast · Published August 2026
					</span>
					<h1 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight text-foreground mt-6">
						The self-driving software factory
					</h1>
					<p className="text-muted-foreground mt-4 leading-relaxed">
						Six levels of factory autonomy, the gates between them, and our
						forecast for how far 2026 gets us. Written down now so you can grade
						us later.
					</p>
					<p className="text-muted-foreground mt-4 leading-relaxed">
						Predictions about AI are cheap because nobody checks them. This page
						is a rubric, not a vibe: every gate below is either true or false of
						a real team shipping real software. We update it as gates open, and
						we do not move the goalposts.
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
						The rubric
					</span>
					<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground mt-4">
						Six levels of factory autonomy
					</h2>
					<p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
						Borrowed from how self-driving cars are graded, applied to how
						software gets built. The interesting jump is F3 to F4: from agents
						you delegate to, to a factory you direct.
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
						The forecast
					</span>
					<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground mt-4">
						How 2026 plays out
					</h2>
					<p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
						Part record, part bet. The first two entries are already happening.
						The rest is stated concretely enough to be wrong about.
					</p>

					<div className="mt-10">
						<ForecastChart />
					</div>

					<div className="mt-12 flex flex-col gap-16">
						{FORECAST_PERIODS.map((entry) => (
							<ForecastEntry key={entry.period} entry={entry} />
						))}
					</div>

					<div className="mt-16 border border-border p-6 md:p-8">
						<span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
							Beyond: F5 is not a near-term claim
						</span>
						<p className="text-muted-foreground mt-3 leading-relaxed">
							We do not forecast full self-driving in 2026 or 2027. The honest
							unknowns: whether agent review holds up against adversarial
							complexity, whether specification can replace code reading as the
							trust anchor at scale, and whether compute economics keep the
							overnight shift cheaper than the humans it augments. F5 is a
							rubric entry so we recognize it when we see it, not a promise.
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
						The scorecard
					</span>
					<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground mt-4">
						Where the industry is, honestly
					</h2>
					<p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
						Our read as of August 2026, based on our own team and the teams we
						watch closely. F3 is mostly open. F4 is mostly closed. That gap is
						the work.
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
						The factory needs a floor
					</h2>
					<p className="text-muted-foreground mt-3 max-w-lg mx-auto leading-relaxed">
						Superset is the workbench for the F3 to F4 transition: parallel
						agents in isolated workspaces, fleets you can actually supervise,
						and a review surface for code you did not write.
					</p>
					<div className="mt-8 flex items-center justify-center gap-4">
						<Link
							href="/download"
							className="bg-foreground text-background px-6 py-3 text-sm font-normal transition-colors hover:bg-brand hover:text-white"
						>
							Download Superset
						</Link>
						<Link
							href="/changelog"
							className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
						>
							Read the changelog
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
