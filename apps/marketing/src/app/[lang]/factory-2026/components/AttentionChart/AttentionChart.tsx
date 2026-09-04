"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { ATTENTION_CURVE } from "../../constants";

const W = 560;
const H = 220;
const PAD = { top: 20, right: 20, bottom: 28, left: 40 };

const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

const x = (index: number) =>
	PAD.left + (index / (ATTENTION_CURVE.length - 1)) * plotW;
const y = (share: number) => PAD.top + (1 - share / 100) * plotH;

const LABELED_LEVELS = new Set(["F0", "F3", "F5"]);

export function AttentionChart() {
	const { t } = useLingui();
	const [hovered, setHovered] = useState<number | null>(null);

	const path = ATTENTION_CURVE.map(
		(point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.share)}`,
	).join(" ");

	const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const px = ((event.clientX - rect.left) / rect.width) * W;
		const index = Math.round(
			((px - PAD.left) / plotW) * (ATTENTION_CURVE.length - 1),
		);
		setHovered(Math.max(0, Math.min(ATTENTION_CURVE.length - 1, index)));
	};

	const hoveredPoint = hovered === null ? null : ATTENTION_CURVE[hovered];
	// Named local so the tooltip message extracts as `{share}`, not `{0}`.
	const share = hoveredPoint?.share ?? 0;

	return (
		<figure className="border border-border p-4 md:p-6">
			<figcaption>
				<span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
					<Trans>
						Fig. 1 · Human share of the effort behind a merged change
					</Trans>
				</span>
				<span className="block text-xs text-muted-foreground mt-1">
					<Trans>Schematic, by autonomy level. Hover for values.</Trans>
				</span>
			</figcaption>
			<div className="relative mt-4">
				<svg
					viewBox={`0 0 ${W} ${H}`}
					className="w-full h-auto touch-none"
					role="img"
					aria-label={t({
						message:
							"Line chart: the human share of effort per merged change falls from 100 percent at F0 to about 2 percent at F5",
					})}
					onPointerMove={onMove}
					onPointerLeave={() => setHovered(null)}
				>
					{/* Gridlines */}
					{[0, 50, 100].map((tick) => (
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

					<path d={path} fill="none" className="stroke-brand" strokeWidth={2} />

					{ATTENTION_CURVE.map((point, index) => (
						<g key={point.level}>
							<circle
								cx={x(index)}
								cy={y(point.share)}
								r={hovered === index ? 5 : 4}
								className="fill-brand"
								stroke="var(--background)"
								strokeWidth={2}
							/>
							{LABELED_LEVELS.has(point.level) && hovered !== index && (
								<text
									x={x(index)}
									y={y(point.share) - 10}
									textAnchor="middle"
									className="fill-foreground font-mono"
									fontSize={10}
								>
									{point.share}%
								</text>
							)}
							<text
								x={x(index)}
								y={H - 8}
								textAnchor="middle"
								className={`font-mono ${point.level === "F3" ? "fill-foreground" : "fill-muted-foreground"}`}
								fontSize={10}
							>
								{point.level}
							</text>
						</g>
					))}

					{/* You are here marker at F3 */}
					<line
						x1={x(3)}
						x2={x(3)}
						y1={y(ATTENTION_CURVE[3]?.share ?? 0) + 8}
						y2={H - PAD.bottom}
						className="stroke-foreground/30"
						strokeWidth={1}
						strokeDasharray="3 3"
					/>
				</svg>

				{hoveredPoint && hovered !== null && (
					<div
						className="pointer-events-none absolute -translate-x-1/2 border border-border bg-background px-2 py-1 text-[11px] font-mono whitespace-nowrap"
						style={{
							left: `${(x(hovered) / W) * 100}%`,
							top: `${(Math.max(0, y(hoveredPoint.share) - 34) / H) * 100}%`,
						}}
					>
						<span className="text-muted-foreground">{hoveredPoint.level}</span>{" "}
						<span className="text-foreground">
							<Trans>{share}% human</Trans>
						</span>
					</div>
				)}
			</div>
			<p className="text-xs font-mono text-muted-foreground mt-2">
				<Trans>
					<span className="text-foreground">F3</span> · you are here
				</Trans>
			</p>
		</figure>
	);
}
