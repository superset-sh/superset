import { Trans, useLingui } from "@lingui/react/macro";
import { formatList } from "@superset/i18n/format";
import {
	type AxisValues,
	MIN_ACTIVE_DAYS,
	rankingGap,
	scoredGaps,
	type Tier,
} from "@superset/trpc/leaderboard-tier";
import { MeterBar } from "@/app/[lang]/components/MeterBar";
import { tierLabel } from "@/app/[lang]/components/TierBadge";
import {
	AXIS_LABELS,
	AXIS_UNITS,
} from "@/app/[lang]/components/TierGate/constants";
import { axisValue, fill, laggingGaps } from "@/app/[lang]/utils/axisGaps";

interface TierObjectivesProps {
	tier: number;
	axes: AxisValues;
}

export function TierObjectives({ tier, axes }: TierObjectivesProps) {
	const { t } = useLingui();
	const unranked = tier <= 0;
	const gaps = unranked ? [rankingGap(axes)] : scoredGaps(axes, tier as Tier);
	const atTop = tier >= 4;
	const nextLabel = t(tierLabel(Math.min(4, tier + 1)));
	const met = gaps.filter((gap) => gap.met).length;

	const BRAND = "210,86,17";

	const laggingLabels = formatList(
		laggingGaps(gaps, 2).map((gap) => t(AXIS_LABELS[gap.axis]).toLowerCase()),
	);

	return (
		<details className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
			<summary className="flex cursor-pointer list-none items-center gap-3 outline-none focus-visible:ring-1 focus-visible:ring-brand">
				<span
					aria-hidden="true"
					className="flex shrink-0 items-center text-muted-foreground/50 transition-transform group-open:rotate-90"
				>
					<svg width="7" height="9" viewBox="0 0 7 9" fill="currentColor">
						<title>toggle</title>
						<path d="M0 0l7 4.5L0 9z" />
					</svg>
				</span>

				<span className="min-w-0 flex-1 font-mono text-[0.62rem] uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
					{atTop ? (
						<Trans>
							All objectives cleared. Top rung, nothing left to reach for.
						</Trans>
					) : unranked ? (
						<Trans>
							Unranked until {String(MIN_ACTIVE_DAYS)} days carry usage.
						</Trans>
					) : met === gaps.length ? (
						<Trans>
							All {gaps.length} objectives are carrying their weight for{" "}
							{nextLabel}.
						</Trans>
					) : (
						<Trans>
							{met} of {gaps.length} objectives carrying for {nextLabel} —{" "}
							{laggingLabels} furthest behind.
						</Trans>
					)}
				</span>

				{!atTop && (
					<span
						className={`shrink-0 font-mono text-[0.62rem] tabular-nums ${
							met === gaps.length ? "text-muted-foreground" : "text-brand"
						}`}
					>
						{`${met}/${gaps.length}`}
					</span>
				)}
			</summary>

			<div className="mt-4 space-y-3">
				{gaps.map((gap) => {
					const color = gap.met ? "rgba(255,255,255,0.22)" : `rgb(${BRAND})`;

					return (
						<div key={gap.axis}>
							<div className="flex items-baseline justify-between gap-3 font-mono text-[0.62rem]">
								<span className="flex min-w-0 items-baseline gap-2">
									<span
										aria-hidden="true"
										className="inline-block size-2 shrink-0 translate-y-[1px]"
										style={
											gap.met
												? { backgroundColor: "rgba(255,255,255,0.3)" }
												: {
														backgroundColor: "transparent",
														boxShadow: `inset 0 0 0 1px rgba(${BRAND},0.9)`,
													}
										}
									/>
									<span className="uppercase tracking-[0.1em] text-muted-foreground">
										{t(AXIS_LABELS[gap.axis])}
									</span>
								</span>

								<span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
									<span
										className={
											gap.met ? "text-muted-foreground" : "text-foreground"
										}
									>
										{axisValue(gap.axis, gap.current)}
									</span>
									<span className="text-muted-foreground/40">
										{gap.lowerIsBetter ? "\u2264" : "/"}
									</span>
									<span className="text-muted-foreground/70">
										{axisValue(gap.axis, gap.needed)}
									</span>
									<span className="text-muted-foreground/40">
										{t(AXIS_UNITS[gap.axis])}
									</span>
								</span>
							</div>

							<MeterBar className="mt-1.5" value={fill(gap)} color={color} />
						</div>
					);
				})}
			</div>

			<p className="mt-4 border-t border-border pt-3 font-mono text-[0.6rem] leading-relaxed text-muted-foreground/60">
				{atTop ? (
					<Trans>Top tier. Nothing left to clear.</Trans>
				) : unranked ? (
					<Trans>
						Scoring starts once the board can see {String(MIN_ACTIVE_DAYS)} days
						of usage.
					</Trans>
				) : met === gaps.length ? (
					<Trans>
						Every objective is carrying its weight for the next rung. Measured
						over the trailing 30 days.
					</Trans>
				) : (
					<Trans>
						Your rung is a weighted score across the {String(gaps.length)}{" "}
						objectives measured for you, so a strong one offsets a weak one.
						Measured over the trailing 30 days.
					</Trans>
				)}
			</p>
		</details>
	);
}
