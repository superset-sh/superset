import type { Metadata } from "next";
import Link from "next/link";
import { GridCross } from "@/app/[lang]/blog/components/GridCross";
import { initServerI18n } from "@/app/i18n-server";
import { ProductionLineMark } from "./components/ProductionLineMark";
import { RunningLine } from "./components/RunningLine";
import { RunSimulator } from "./components/RunSimulator";
import { RunTabs } from "./components/RunTabs";
import { TierCard } from "./components/TierCard";
import { TrajectoryChart } from "./components/TrajectoryChart";
import { VariableTable } from "./components/VariableTable";
import {
	DOUBLING_MONTHS,
	GRADED_AXES,
	PRICE_DECLINE_PER_YEAR,
	PRICE_PER_MTOK_TODAY,
	PRODUCTION_TIERS,
	RUNS,
	runStatus,
	runStatusLabel,
} from "./constants";

const DESCRIPTION =
	"Our prediction for when the software factory actually arrives, the four tiers on the way there, and the first production run, starting in September.";

export const metadata: Metadata = {
	title: "The Production Run",
	description: DESCRIPTION,
	alternates: {
		canonical: "/the-production-run",
	},
	openGraph: {
		title: "The Production Run | Superset",
		description: DESCRIPTION,
		url: "/the-production-run",
		images: ["/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: "The Production Run | Superset",
		description: DESCRIPTION,
		images: ["/opengraph-image"],
	},
};

const SECTION = "relative scroll-mt-24 border-b border-border";
const INNER = "max-w-3xl mx-auto px-6 py-16 relative";
const EYEBROW =
	"text-sm font-mono text-muted-foreground uppercase tracking-wider";
const H2 =
	"text-2xl md:text-3xl font-medium tracking-tight text-foreground mt-4";
const BODY = "text-muted-foreground mt-4 leading-relaxed";

export default async function ProductionRunPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	await initServerI18n();

	const requested = (await searchParams).run;
	const wanted = Array.isArray(requested) ? requested[0] : requested;
	const initialTab =
		RUNS.find((run) => String(run.number) === wanted || run.id === wanted)
			?.id ?? "overview";
	const now = new Date();
	const statuses = Object.fromEntries(
		RUNS.map((run) => [run.id, runStatus(run, now)]),
	);
	const statusLabels = Object.fromEntries(
		RUNS.map((run) => [run.id, runStatusLabel(runStatus(run, now), run)]),
	);

	return (
		<main className="relative min-h-screen">
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					backgroundImage: `
						linear-gradient(to right, transparent 0%, transparent calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 383px), transparent calc(50% - 383px), transparent calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 384px), transparent calc(50% + 384px))
					`,
				}}
			/>

			<header className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 pt-16 pb-10 md:pt-20 md:pb-12 relative">
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />

					<div className="mb-8">
						<ProductionLineMark />
					</div>

					<span className="inline-flex items-center gap-2 text-xs font-mono text-muted-foreground border border-border rounded-[2px] px-3 py-1.5 bg-foreground/[0.03]">
						<span className="text-brand shrink-0">●</span>
						Prediction · First run September 2026
					</span>
					<h1 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight text-foreground mt-6">
						The Production Run
					</h1>
					<p className={BODY}>
						A factory proves itself with a production run, not a prototype. The
						same output, repeatedly, at a rate, without heroics.
					</p>
					<p className={BODY}>
						<strong className="text-foreground">
							By August 2028 we expect more than one in five developers on our
							leaderboard at the top tier, and the median one rung below it.
						</strong>{" "}
						Ten agent workstreams at once, ten agent-written PRs merging a week.
						Today that number is zero.
					</p>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			<RunTabs
				initialTab={initialTab}
				runs={RUNS}
				statuses={statuses}
				statusLabels={statusLabels}
				overview={
					<>
						<section id="what" className={SECTION}>
							<div className={INNER}>
								<GridCross className="bottom-0 left-0" />
								<GridCross className="bottom-0 right-0" />

								<span className={EYEBROW}>The run</span>
								<h2 className={H2}>What a production run is</h2>
								<p className={BODY}>
									A fixed window where everyone pushes the same number and we
									see what actually moves. Not a demo, not a launch week. One
									month, one target, measured the same way for everyone.
								</p>
								<p className={BODY}>
									Predictions that cannot be checked are marketing. This one has
									a date, a metric, and a{" "}
									<Link
										href="/leaderboard"
										className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground transition-colors"
									>
										public scoreboard
									</Link>
									. If we are wrong it will say so in front of everybody.
								</p>
							</div>
						</section>

						<section id="parameters" className={SECTION}>
							<div className={INNER}>
								<GridCross className="bottom-0 left-0" />
								<GridCross className="bottom-0 right-0" />

								<span className={EYEBROW}>The parameters</span>
								<h2 className={H2}>What we measure</h2>
								<p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
									Six numbers come off your machine. Five are recorded per day,
									one across the trailing 30. Five get graded.
								</p>

								<div className="mt-8">
									<VariableTable />
								</div>

								<dl className="mt-10 flex flex-col gap-4">
									{GRADED_AXES.map((axis) => (
										<div key={axis.name}>
											<dt className="text-foreground">
												{axis.name}{" "}
												<span className="font-mono text-xs text-muted-foreground">
													{axis.source}
												</span>
											</dt>
											<dd className="text-muted-foreground mt-1 leading-relaxed">
												{axis.rationale}
											</dd>
										</div>
									))}
								</dl>

								<p className={BODY}>
									Your tier is the{" "}
									<strong className="text-foreground">minimum</strong> across
									all five, never an average. Ten parallel sessions that never
									merge anything leaves Output at the bottom, so you are at the
									bottom. Every axis measures something you had to give up:
									watching, reviewing, scheduling, holding state. You cannot
									compensate for still doing one by doing more of another.
								</p>
								<p className={BODY}>
									The gates are deliberately out of reach today, because a high
									bar is the point of having one. And because the numbers arrive
									from your own machine, the board is public and every entry is
									flaggable, and accounts that manufacture merges get hidden.
								</p>
								<p className={BODY}>
									It runs over your trailing 30 days. You promote when 60% of
									your active days clear the next tier, hold until you drop
									under 40%, and sit unranked below 8 active days. One good
									Tuesday moves nothing.
								</p>
								<p className={BODY}>
									None of your work leaves your machine: not prompts, file
									paths, repo or branch names, PR titles or numbers. Five
									numbers a day, plus the handle you choose.
								</p>

								<div className="mt-8 border-l-2 border-brand pl-5 py-1">
									<p className="text-muted-foreground leading-relaxed">
										<strong className="text-foreground">On being wrong.</strong>{" "}
										These floors are calibration guesses and will move as real
										data arrives. Output is the weakest today: PR sync is
										GitHub-only, sees only work inside Superset workspaces, and
										can miss a merge observed while the app is closed. We would
										rather ship an instrument that undercounts and fix it in
										public.
									</p>
								</div>
							</div>
						</section>

						<section id="tiers" className={SECTION}>
							<div className={INNER}>
								<GridCross className="bottom-0 left-0" />
								<GridCross className="bottom-0 right-0" />

								<span className={EYEBROW}>The ladder</span>
								<h2 className={H2}>The four tiers</h2>
								<p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
									Each rung moves the unit of your attention up one level. Line,
									task, queue, direction. Every card leads with how you would
									know you are there, without looking at a dashboard.
								</p>

								<div className="mt-10 flex flex-col gap-4">
									{PRODUCTION_TIERS.map((tier) => (
										<TierCard key={tier.tier} tier={tier} />
									))}
								</div>
							</div>
						</section>

						<section id="run-it" className={SECTION}>
							<div className={INNER}>
								<GridCross className="bottom-0 left-0" />
								<GridCross className="bottom-0 right-0" />

								<span className={EYEBROW}>Run it</span>
								<h2 className={H2}>Two years, on a slider</h2>
								<p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
									Drag time forward, or press play. Every axis doubles every
									seven months. Width, Depth and Output do; Sustain climbs
									linearly and Cost falls out of the rest. This is one
									developer&apos;s path, not the board&apos;s distribution.
								</p>

								<div className="mt-8">
									<RunSimulator />
								</div>

								<p className={BODY}>
									The badge waits, then jumps: it cannot move until the slowest
									axis clears, and for a stretch in the middle every axis reads{" "}
									<em className="not-italic text-foreground">holding</em> at
									once. Meanwhile the cost of landing one change falls the whole
									way. The slider runs a few months past August 2028 so the top
									tier is legible.
								</p>
							</div>
						</section>

						<section id="cost" className={SECTION}>
							<div className={INNER}>
								<GridCross className="bottom-0 left-0" />
								<GridCross className="bottom-0 right-0" />

								<span className={EYEBROW}>The deflator</span>
								<h2 className={H2}>
									The ladder gets cheaper while you climb it
								</h2>
								<p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
									Depth asks for 10.8x more tokens per session. That is not a
									10.8x bigger bill.
								</p>

								<div className="mt-8 grid gap-px bg-border border border-border sm:grid-cols-3">
									<div className="bg-background p-5">
										<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
											Aug 2026
										</span>
										<p className="text-xl font-medium tracking-tight text-foreground mt-2 tabular-nums">
											$3.75
										</p>
										<p className="text-sm text-muted-foreground mt-1">
											3.75M tokens at ${PRICE_PER_MTOK_TODAY}/Mtok
										</p>
									</div>
									<div className="bg-background p-5">
										<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
											Aug 2028
										</span>
										<p className="text-xl font-medium tracking-tight text-foreground mt-2 tabular-nums">
											$1.62
										</p>
										<p className="text-sm text-muted-foreground mt-1">
											40.4M tokens at $0.04/Mtok
										</p>
									</div>
									<div className="bg-background p-5">
										<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
											Net
										</span>
										<p className="text-xl font-medium tracking-tight text-brand mt-2 tabular-nums">
											57% cheaper
										</p>
										<p className="text-sm text-muted-foreground mt-1">
											for 10.8x the tokens
										</p>
									</div>
								</div>

								<p className={BODY}>
									We assume capability-adjusted prices fall{" "}
									<strong className="text-foreground">
										{PRICE_DECLINE_PER_YEAR}x a year
									</strong>{" "}
									as the middle of published coding-specific estimates, not the
									conservative end. Frontier sticker prices went the other way
									this year, and newer tokenizers emit more tokens for the same
									text. The margin is real but thin: at 3x a year the
									per-session bill rises instead.
								</p>
								<p className={BODY}>
									Cost is graded on dollars per merged PR, never on spend. Spend
									is about to get trivially easy, so grading it would grade the
									calendar. The modelled path runs $15.00 a change today to
									$3.23 in 2028. Deflation supplies 2.3x of that, and the other
									2x is an assumption we have no data for yet, that rework falls
									from four sessions per landed PR to two.
								</p>
								<p className={BODY}>
									Be clear about what rises. Ten times the output at a falling
									unit price still roughly doubles the weekly bill, from about
									$15 to $35. What falls is the cost of each shipped change.
								</p>
							</div>
						</section>

						<section id="growth" className={SECTION}>
							<div className={INNER}>
								<GridCross className="bottom-0 left-0" />
								<GridCross className="bottom-0 right-0" />

								<span className={EYEBROW}>The forecast</span>
								<h2 className={H2}>The shape of the growth</h2>
								<p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
									The rungs span 1 to 10 parallel sessions. Put the top at
									August 2028 and the rate falls out of the ladder itself.
								</p>

								<div className="mt-8 border border-border bg-foreground/[0.015] p-6 font-mono text-sm text-muted-foreground">
									10x = 2<sup>3.32</sup>, so 24 ÷ 3.32 ≈{" "}
									<span className="text-foreground">
										a doubling every ~{DOUBLING_MONTHS} months
									</span>
								</div>

								<p className={BODY}>
									Depth&apos;s 16x wants six months, Output&apos;s 10x wants
									seven. We ramp all three at seven and let Depth arrive last.
									This is not evidence the rate is right. It is the rate the
									ladder implies once you fix the top rung to a date. The span
									is the input, not a finding.
								</p>
								<p className={BODY}>
									The{" "}
									<a
										href="https://ai-2027.com"
										target="_blank"
										rel="noopener noreferrer"
										className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground transition-colors"
									>
										AI 2027
									</a>{" "}
									scenario imagines far steeper: 1.5x to 4x, 10x, 25x and 50x
									inside twenty months. Different quantity and a scenario rather
									than a measurement. Those are algorithmic-progress multipliers
									inside a frontier lab, and it puts total progress at about
									half that. But if anything near that shape holds, seven months
									is the slow reading.
								</p>
								<p className={BODY}>
									<strong className="text-foreground">
										The frontier arrives long before the median.
									</strong>{" "}
									One developer on the board sustained a median of 15 concurrent
									sessions over the 30 days to 27 August 2026, which is Henry
									Ford width, while the median developer sat at one. Their badge
									is still low, because Output has not caught up.
								</p>

								<div className="mt-10">
									<TrajectoryChart />
								</div>

								<p className={BODY}>
									That measured strip is real: on 27 August 2026, one person in
									320 ranked developers was above the bottom tier. Some of the
									gap is the instrument, Output cannot see most merged PRs yet,
									so people running four agents read as Button pushers. Some of
									it is not. Telling those apart is most of what September is
									for.
								</p>
								<p className={BODY}>
									Two things this forecast leans on, said plainly. The modelled
									developer starts at 3.75M tokens a session, 1.5x the Operator
									floor, and without that head start Depth needs 28 months, not
									24. And the table above is our judgement, not output from the
									model beside it: the model describes one developer, and
									nothing derives a population from it.
								</p>
								<p className={BODY}>
									<strong className="text-foreground">
										The floors never move to chase the curve.
									</strong>{" "}
									Lower them to keep the distribution healthy and the badge
									stops measuring anything absolute and starts measuring rank.
									If in eighteen months the observed doubling time is twenty
									rather than seven, we were wrong, and the same scoreboard says
									so.
								</p>
							</div>
						</section>

						<section className={SECTION}>
							<div className={INNER}>
								<GridCross className="bottom-0 left-0" />
								<GridCross className="bottom-0 right-0" />
								<span className={EYEBROW}>The line</span>
								<h2 className={H2}>Ten streams, running</h2>
								<p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
									What the top tier looks like from the outside: work landing
									while you are not watching it.
								</p>
								<div className="mt-8">
									<RunningLine />
								</div>
							</div>
						</section>
					</>
				}
			/>

			<section className="relative">
				<div className="max-w-3xl mx-auto px-6 py-16 md:py-20 relative text-center">
					<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground">
						Join the run
					</h2>
					<p className="text-muted-foreground mt-3 max-w-lg mx-auto leading-relaxed">
						Opt in from the desktop app and your tier shows up alongside
						everyone else&apos;s. Publish privately if you would rather compete
						without a name attached.
					</p>
					<div className="mt-8 flex items-center justify-center gap-4">
						<Link
							href="/download"
							className="bg-foreground text-background px-6 py-3 text-sm font-normal transition-colors hover:bg-brand hover:text-white"
						>
							Download Superset
						</Link>
						<Link
							href="/leaderboard"
							className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
						>
							See the board
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
