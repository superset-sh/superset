"use client";

import { useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useRef, useState } from "react";
import { tierLabel, tierRgb } from "@/app/[lang]/components/TierBadge";
import { TierIcon } from "@/app/[lang]/components/TierIcon";
import {
	COST_CEILINGS,
	FLOORS,
	monthLabel,
	RUN_MONTHS,
	runStateAt,
	SLIDER_MONTHS,
} from "../../constants";
import { Readout } from "./components/Readout";

const PLAY_MS = 11000;

function formatTokens(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
	if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
	return String(Math.round(value));
}

export function RunSimulator() {
	const { t } = useLingui();
	const [months, setMonths] = useState(0);
	const [playing, setPlaying] = useState(false);
	const frame = useRef<number | null>(null);
	const latest = useRef(0);

	latest.current = months;

	const stop = useCallback(() => {
		setPlaying(false);
		if (frame.current !== null) cancelAnimationFrame(frame.current);
		frame.current = null;
	}, []);

	useEffect(() => {
		if (!playing) return;

		const from = latest.current >= SLIDER_MONTHS ? 0 : latest.current;
		const span = SLIDER_MONTHS - from;
		const duration = PLAY_MS * (span / SLIDER_MONTHS);
		const startedAt = performance.now();

		const step = (now: number) => {
			const fraction = (now - startedAt) / duration;
			if (fraction >= 1) {
				setMonths(SLIDER_MONTHS);
				setPlaying(false);
				frame.current = null;
				return;
			}
			setMonths(from + span * fraction);
			frame.current = requestAnimationFrame(step);
		};

		frame.current = requestAnimationFrame(step);
		return () => {
			if (frame.current !== null) cancelAnimationFrame(frame.current);
		};
	}, [playing]);

	const state = runStateAt(months);
	const start = runStateAt(0);
	const tokenRatio =
		(state.sessionsPerPr * state.depth) / (start.sessionsPerPr * start.depth);
	const costRatio = start.costPerPr / state.costPerPr;
	const rgb = tierRgb(state.tier);
	const nextTier = Math.min(4, state.tier + 1);
	const atTop = state.tier >= 4;

	return (
		<div className="border border-border">
			<div className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(240px,0.85fr)]">
				<div className="p-5 md:p-6 border-b md:border-b-0 md:border-r border-border">
					<div className="flex items-baseline justify-between gap-3">
						<span className="text-sm font-mono text-foreground">
							{monthLabel(state.months)}
						</span>
						<span className="text-[11px] font-mono text-muted-foreground">
							{state.months <= RUN_MONTHS
								? `month ${Math.round(state.months)} of ${RUN_MONTHS}`
								: "past the forecast window"}
						</span>
					</div>

					<input
						type="range"
						min={0}
						max={SLIDER_MONTHS}
						step={0.25}
						value={months}
						aria-label="Months from August 2026"
						onChange={(event) => {
							stop();
							setMonths(Number(event.target.value));
						}}
						className="w-full mt-3 accent-foreground cursor-pointer"
						style={{ accentColor: `rgb(${rgb})` }}
					/>

					<div className="flex items-center gap-3 mt-3">
						<button
							type="button"
							onClick={() => (playing ? stop() : setPlaying(true))}
							className="border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-foreground hover:bg-foreground hover:text-background transition-colors"
						>
							{playing ? "Pause" : months >= SLIDER_MONTHS ? "Replay" : "Play"}
						</button>
						<span className="text-[11px] text-muted-foreground">
							Two years at one doubling every seven months.
						</span>
					</div>

					<div className="mt-5">
						<Readout
							accent={rgb}
							label="Width · parallel sessions"
							value={state.width.toFixed(2)}
							floor={
								atTop
									? "top"
									: `T${nextTier} \u2265 ${FLOORS.width[nextTier - 1]}`
							}
							held={state.limitedBy.includes("Width")}
						/>
						<Readout
							accent={rgb}
							label="Depth · tokens per session"
							value={formatTokens(state.depth)}
							floor={
								atTop
									? "top"
									: `T${nextTier} \u2265 ${formatTokens(
											FLOORS.depth[nextTier - 1] ?? 0,
										)}`
							}
							held={state.limitedBy.includes("Depth")}
						/>
						<Readout
							accent={rgb}
							label="Output · merged PRs per week"
							value={state.output.toFixed(2)}
							floor={
								atTop
									? "top"
									: `T${nextTier} \u2265 ${FLOORS.output[nextTier - 1]}`
							}
							held={state.limitedBy.includes("Output")}
						/>
						<Readout
							accent={rgb}
							label="Sustain · active days in 30"
							value={state.sustain.toFixed(1)}
							floor={
								atTop
									? "top"
									: `T${nextTier} \u2265 ${FLOORS.sustain[nextTier - 1]}`
							}
							held={state.limitedBy.includes("Sustain")}
						/>
						<Readout
							accent={rgb}
							label="Cost · $ per merged PR"
							value={`$${state.costPerPr.toFixed(2)}`}
							floor={
								atTop
									? "top"
									: `T${nextTier} \u2264 $${COST_CEILINGS[nextTier - 1]}`
							}
							held={state.limitedBy.includes("Cost")}
						/>
					</div>
				</div>

				<div className="p-5 md:p-6">
					<div
						className="border p-5 text-center"
						style={{
							borderColor: `rgba(${rgb},0.4)`,
							background: `rgba(${rgb},0.04)`,
						}}
					>
						<span
							className="inline-flex justify-center"
							style={{ color: `rgb(${rgb})` }}
						>
							<TierIcon tier={state.tier} size={30} />
						</span>
						<p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mt-3">
							Tier {state.tier}
						</p>
						<p
							className="text-xl md:text-2xl font-medium tracking-tight mt-1"
							style={{ color: `rgb(${rgb})` }}
						>
							{t(tierLabel(state.tier))}
						</p>
					</div>

					<div className="mt-4">
						<div className="flex items-baseline justify-between gap-2">
							<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
								{atTop
									? "Ladder complete"
									: `Progress to ${t(tierLabel(state.tier + 1))}`}
							</span>
							<span className="text-[11px] font-mono text-muted-foreground tabular-nums">
								{Math.round(state.progress * 100)}%
							</span>
						</div>
						<div className="mt-2 h-1.5 w-full bg-border overflow-hidden">
							<div
								className="h-full transition-[width] duration-100"
								style={{
									width: `${state.progress * 100}%`,
									background: `rgb(${rgb})`,
								}}
							/>
						</div>
					</div>

					<dl className="mt-5 text-xs">
						<div className="flex justify-between gap-3 border-t border-border py-2">
							<dt className="text-muted-foreground">Blended $/Mtok</dt>
							<dd className="font-mono text-foreground tabular-nums">
								${state.pricePerMtok.toFixed(2)}
							</dd>
						</div>
						<div className="flex justify-between gap-3 border-t border-border py-2">
							<dt className="text-muted-foreground">Cost per session</dt>
							<dd className="font-mono text-foreground tabular-nums">
								${state.costPerSession.toFixed(2)}
							</dd>
						</div>
						<div className="flex justify-between gap-3 border-t border-border py-2">
							<dt className="text-muted-foreground">Sessions per PR</dt>
							<dd className="font-mono text-foreground tabular-nums">
								{state.sessionsPerPr.toFixed(2)}
							</dd>
						</div>
					</dl>

					<p className="text-[11px] text-muted-foreground leading-relaxed mt-3">
						{atTop
							? `${tokenRatio.toFixed(1)}x the tokens per merged PR, at ${costRatio.toFixed(1)}x lower cost per merged PR. Shipping got cheaper while the work got bigger.`
							: "Tokens per PR climb. The cost of landing one falls anyway, though the weekly total still rises."}
					</p>
				</div>
			</div>
		</div>
	);
}
