import { useLingui } from "@lingui/react/macro";
import { TIER_NAMES, TIER_RGB } from "@/app/[lang]/components/TierBadge";
import { MEASURED_TODAY, TRAJECTORY } from "../../constants";

const W = 560;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 30, left: 34 };

const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

const T_MIN = TRAJECTORY[0]?.t ?? 0;
const T_MAX = TRAJECTORY[TRAJECTORY.length - 1]?.t ?? 1;

const x = (t: number) => PAD.left + ((t - T_MIN) / (T_MAX - T_MIN)) * plotW;
const y = (share: number) => PAD.top + (1 - share / 100) * plotH;

const stackedTop = (shares: readonly number[], index: number) =>
	shares.slice(0, index + 1).reduce((sum, share) => sum + share, 0);

function bandPath(index: number): string {
	const top = TRAJECTORY.map(
		(point) => `${x(point.t)},${y(stackedTop(point.shares, index))}`,
	);
	const bottom = [...TRAJECTORY]
		.reverse()
		.map((point) => `${x(point.t)},${y(stackedTop(point.shares, index - 1))}`);
	return `M${top.join(" L")} L${bottom.join(" L")} Z`;
}

export function TrajectoryChart() {
	const { t } = useLingui();

	return (
		<figure className="m-0">
			<div className="border border-border bg-foreground/[0.015] p-4">
				<svg
					viewBox={`0 0 ${W} ${H}`}
					className="w-full h-auto"
					role="img"
					aria-label="Forecast share of developers at each tier from August 2026 to August 2028"
				>
					<title>Forecast tier distribution, August 2026 to August 2028</title>

					{[0, 25, 50, 75, 100].map((tick) => (
						<g key={tick}>
							<line
								x1={PAD.left}
								x2={W - PAD.right}
								y1={y(tick)}
								y2={y(tick)}
								stroke="currentColor"
								strokeWidth="0.5"
								className="text-border"
							/>
							<text
								x={PAD.left - 7}
								y={y(tick) + 3}
								textAnchor="end"
								className="fill-muted-foreground"
								style={{ fontSize: 9, fontFamily: "ui-monospace, monospace" }}
							>
								{tick}
							</text>
						</g>
					))}

					{TIER_RGB.map((rgb, index) => (
						<path
							key={rgb}
							d={bandPath(index)}
							fill={`rgb(${rgb})`}
							fillOpacity={0.62}
							stroke={`rgb(${rgb})`}
							strokeWidth="1"
						/>
					))}

					{TRAJECTORY.map((point) => (
						<text
							key={point.label}
							x={x(point.t)}
							y={H - 10}
							textAnchor="middle"
							className="fill-muted-foreground"
							style={{ fontSize: 9, fontFamily: "ui-monospace, monospace" }}
						>
							{point.label}
						</text>
					))}
				</svg>
			</div>

			<div className="mt-4 border border-border p-4">
				<div className="flex items-baseline justify-between gap-3">
					<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
						Measured 27 Aug 2026 · the bands above are the target
					</span>
					<span className="text-[10px] font-mono text-muted-foreground">
						1 of 320 ranked above the bottom tier
					</span>
				</div>
				<div className="mt-2.5 flex h-3 w-full overflow-hidden">
					{MEASURED_TODAY.map((share, index) => (
						<div
							key={TIER_RGB[index]}
							style={{
								width: `${share}%`,
								background: `rgb(${TIER_RGB[index]})`,
								minWidth: share > 0 ? 2 : 0,
							}}
						/>
					))}
				</div>
			</div>

			<figcaption className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
				{TIER_NAMES.map((name, index) => (
					<span
						key={TIER_RGB[index]}
						className="inline-flex items-center gap-2 text-xs text-muted-foreground"
					>
						<span
							aria-hidden="true"
							className="inline-block h-2.5 w-2.5"
							style={{ background: `rgb(${TIER_RGB[index]})` }}
						/>
						{t(name)}
					</span>
				))}
			</figcaption>
		</figure>
	);
}
