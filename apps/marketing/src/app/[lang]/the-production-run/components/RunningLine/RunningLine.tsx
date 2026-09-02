import { TIER_RGB } from "@/app/[lang]/components/TierBadge";

const TRACKS = 10;
const TRACK_GAP = 15;
const W = 720;
const H = TRACKS * TRACK_GAP + 26;
const RAIL_START = 34;
const RAIL_END = W - 96;

const DELAYS = [0, 2.3, 0.8, 3.1, 1.5, 4.2, 0.4, 2.9, 1.9, 3.6];

export function RunningLine() {
	return (
		<div className="border border-border bg-foreground/[0.015] overflow-hidden">
			<style>{`
				@keyframes prl-travel {
					0%   { transform: translateX(0); opacity: 0; }
					6%   { opacity: 1; }
					88%  { opacity: 1; }
					100% { transform: translateX(${RAIL_END - RAIL_START}px); opacity: 0; }
				}
				@keyframes prl-land {
					0%, 100% { opacity: 0.25; }
					50%      { opacity: 1; }
				}
				.prl-unit {
					animation: prl-travel 5.5s linear infinite;
				}
				.prl-sink {
					animation: prl-land 5.5s ease-in-out infinite;
				}
				@media (prefers-reduced-motion: reduce) {
					.prl-unit, .prl-sink { animation: none; }
					.prl-unit { opacity: 0.85; }
				}
			`}</style>

			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="w-full h-auto"
				role="img"
				aria-label="Ten parallel workstreams running, each landing merged work"
			>
				<title>The line, running</title>

				{Array.from({ length: TRACKS }, (_, i) => {
					const y = 16 + i * TRACK_GAP;
					const color = TIER_RGB[i % TIER_RGB.length] ?? TIER_RGB[3];
					return (
						<g key={`track-${y}`}>
							<line
								x1={RAIL_START}
								x2={RAIL_END}
								y1={y}
								y2={y}
								stroke="currentColor"
								strokeWidth="0.5"
								className="text-border"
							/>
							<rect
								className="prl-unit"
								x={RAIL_START}
								y={y - 2}
								width="9"
								height="4"
								fill={`rgb(${color})`}
								shapeRendering="crispEdges"
								style={{ animationDelay: `-${DELAYS[i] ?? 0}s` }}
							/>
							<rect
								className="prl-sink"
								x={RAIL_END + 8}
								y={y - 2}
								width="4"
								height="4"
								fill={`rgb(${color})`}
								shapeRendering="crispEdges"
								style={{ animationDelay: `-${DELAYS[i] ?? 0}s` }}
							/>
						</g>
					);
				})}

				<line
					x1={RAIL_END + 2}
					x2={RAIL_END + 2}
					y1={8}
					y2={H - 18}
					stroke="currentColor"
					strokeWidth="0.5"
					className="text-border"
				/>
				<text
					x={RAIL_END + 18}
					y={H - 6}
					fill="currentColor"
					className="text-muted-foreground"
					style={{
						fontSize: 8.5,
						fontFamily: "ui-monospace, monospace",
						letterSpacing: "0.14em",
					}}
				>
					MERGED
				</text>
				<text
					x={RAIL_START}
					y={H - 6}
					fill="currentColor"
					className="text-muted-foreground"
					style={{
						fontSize: 8.5,
						fontFamily: "ui-monospace, monospace",
						letterSpacing: "0.14em",
					}}
				>
					SEPTEMBER
				</text>
			</svg>
		</div>
	);
}
