"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { AGENT_SHARE_SERIES, F4_GATE_SHARE, TODAY_T } from "../../constants";

const W = 560;
const H = 250;
const PAD = { top: 24, right: 20, bottom: 28, left: 40 };

const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

const T_MIN = 2024;
const T_MAX = 2028;
const Y_MAX = 60;

const x = (t: number) => PAD.left + ((t - T_MIN) / (T_MAX - T_MIN)) * plotW;
const y = (share: number) => PAD.top + (1 - share / Y_MAX) * plotH;

const history = AGENT_SHARE_SERIES.filter((point) => !point.forecast);
const forecast = AGENT_SHARE_SERIES.filter((point) => point.forecast);
const forecastWithAnchor = history.length
	? [...history.slice(-1), ...forecast]
	: forecast;

const toPath = (points: typeof AGENT_SHARE_SERIES) =>
	points
		.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t)},${y(p.share)}`)
		.join(" ");

export function ForecastChart() {
	const { t } = useLingui();
	const [hovered, setHovered] = useState<number | null>(null);

	const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const px = ((event.clientX - rect.left) / rect.width) * W;
		let best = 0;
		let bestDist = Number.POSITIVE_INFINITY;
		AGENT_SHARE_SERIES.forEach((point, index) => {
			const dist = Math.abs(x(point.t) - px);
			if (dist < bestDist) {
				bestDist = dist;
				best = index;
			}
		});
		setHovered(best);
	};

	const hoveredPoint = hovered === null ? null : AGENT_SHARE_SERIES[hovered];

	return (
		<figure className="border border-border p-4 md:p-6">
			<figcaption>
				<span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
					<Trans>
						Fig. 2 · Merged changes written by agents, zero human edits
					</Trans>
				</span>
				<span className="block text-xs text-muted-foreground mt-1">
					<Trans>
						Industry median, our estimate. Dashed is forecast. The first F4
						teams cross the gate earlier.
					</Trans>
				</span>
			</figcaption>
			<div className="relative mt-4">
				<svg
					viewBox={`0 0 ${W} ${H}`}
					className="w-full h-auto touch-none"
					role="img"
					aria-label={t({
						message:
							"Line chart: the share of merged changes written by agents with zero human edits rises from about 1 percent in 2024 to an estimated 27 percent today, with a forecast crossing the 50 percent F4 gate during 2027",
					})}
					onPointerMove={onMove}
					onPointerLeave={() => setHovered(null)}
				>
					{/* Gridlines */}
					{[0, 25, 50].map((tick) => (
						<g key={tick}>
							<line
								x1={PAD.left}
								x2={W - PAD.right}
								y1={y(tick)}
								y2={y(tick)}
								className="stroke-border"
								strokeWidth={1}
							/>
							<text
								x={PAD.left - 8}
								y={y(tick) + 3}
								textAnchor="end"
								className="fill-muted-foreground font-mono"
								fontSize={10}
							>
								{tick}%
							</text>
						</g>
					))}

					{/* Year ticks */}
					{[2024, 2025, 2026, 2027, 2028].map((year) => (
						<text
							key={year}
							x={x(year)}
							y={H - 8}
							textAnchor="middle"
							className="fill-muted-foreground font-mono"
							fontSize={10}
						>
							{year}
						</text>
					))}

					{/* F4 gate line */}
					<line
						x1={PAD.left}
						x2={W - PAD.right}
						y1={y(F4_GATE_SHARE)}
						y2={y(F4_GATE_SHARE)}
						className="stroke-foreground/40"
						strokeWidth={1}
						strokeDasharray="5 4"
					/>
					<text
						x={W - PAD.right}
						y={y(F4_GATE_SHARE) - 6}
						textAnchor="end"
						className="fill-foreground/70 font-mono"
						fontSize={10}
					>
						<Trans>F4 gate · {F4_GATE_SHARE}%</Trans>
					</text>

					{/* Today marker */}
					<line
						x1={x(TODAY_T)}
						x2={x(TODAY_T)}
						y1={PAD.top}
						y2={H - PAD.bottom}
						className="stroke-brand/40"
						strokeWidth={1}
						strokeDasharray="3 3"
					/>
					<text
						x={x(TODAY_T)}
						y={PAD.top - 8}
						textAnchor="middle"
						className="fill-brand font-mono"
						fontSize={10}
					>
						<Trans>TODAY</Trans>
					</text>

					<path
						d={toPath(history)}
						fill="none"
						className="stroke-brand"
						strokeWidth={2}
					/>
					<path
						d={toPath(forecastWithAnchor)}
						fill="none"
						className="stroke-brand"
						strokeWidth={2}
						strokeDasharray="5 4"
					/>

					{AGENT_SHARE_SERIES.map((point, index) => (
						<circle
							key={point.t}
							cx={x(point.t)}
							cy={y(point.share)}
							r={hovered === index ? 5 : 4}
							className={
								point.forecast ? "fill-background stroke-brand" : "fill-brand"
							}
							strokeWidth={point.forecast ? 2 : 2}
							stroke={point.forecast ? undefined : "var(--background)"}
						/>
					))}
				</svg>

				{hoveredPoint && hovered !== null && (
					<div
						className="pointer-events-none absolute -translate-x-1/2 border border-border bg-background px-2 py-1 text-[11px] font-mono whitespace-nowrap"
						style={{
							left: `${(x(hoveredPoint.t) / W) * 100}%`,
							top: `${(Math.max(0, y(hoveredPoint.share) - 34) / H) * 100}%`,
						}}
					>
						<span className="text-muted-foreground">
							{t(hoveredPoint.label)}
						</span>{" "}
						<span className="text-foreground">{hoveredPoint.share}%</span>
						{hoveredPoint.forecast && (
							<span className="text-brand">
								{" · "}
								<Trans>forecast</Trans>
							</span>
						)}
					</div>
				)}
			</div>
		</figure>
	);
}
