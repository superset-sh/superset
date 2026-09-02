import { TIER_RGB } from "@/app/[lang]/components/TierBadge";
import { DOUBLING_MONTHS, FLOORS, RUN_MONTHS } from "../../constants";

const W = 720;
const H = 232;
const PAD = { top: 18, right: 24, bottom: 32, left: 32 };

const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

const Y_MAX = 11.1;

const x = (months: number) => PAD.left + (months / RUN_MONTHS) * plotW;
const y = (value: number) => PAD.top + (1 - value / Y_MAX) * plotH;

const width = (months: number) => 2 ** (months / DOUBLING_MONTHS);

const crossing = (value: number) => DOUBLING_MONTHS * Math.log2(value);

const tierAt = (value: number) => {
	let tier = 0;
	for (let i = 0; i < FLOORS.width.length; i++) {
		if (value >= (FLOORS.width[i] ?? Number.POSITIVE_INFINITY)) tier = i + 1;
	}
	return tier;
};

const STEP = 0.05;

function segments(): Array<{ tier: number; points: string }> {
	const out: Array<{ tier: number; points: string }> = [];
	let current: { tier: number; points: string[] } | null = null;

	for (let m = 0; m <= RUN_MONTHS + 0.001; m += STEP) {
		const value = Math.min(width(m), Y_MAX);
		const tier = tierAt(value);
		const point = `${x(m).toFixed(2)},${y(value).toFixed(2)}`;

		if (!current || current.tier !== tier) {
			if (current) {
				current.points.push(point);
				out.push({ tier: current.tier, points: current.points.join(" ") });
			}
			current = { tier, points: [point] };
		} else {
			current.points.push(point);
		}
	}
	if (current)
		out.push({ tier: current.tier, points: current.points.join(" ") });
	return out;
}

const YEAR_TICKS = [
	{ months: 0, label: "AUG ’26" },
	{ months: 12, label: "AUG ’27" },
	{ months: 24, label: "AUG ’28" },
];

export function ProductionLineMark() {
	const paths = segments();

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="w-full h-auto"
			role="img"
			aria-label="Parallel sessions per developer doubling every seven months, crossing the Operator, Plant Manager and Henry Ford thresholds between August 2026 and August 2028"
		>
			<title>One doubling every seven months</title>

			{FLOORS.width.map((floor, index) => (
				<g key={floor}>
					<line
						x1={PAD.left}
						x2={W - PAD.right}
						y1={y(floor)}
						y2={y(floor)}
						stroke={`rgb(${TIER_RGB[index] ?? TIER_RGB[3]})`}
						strokeWidth="0.75"
						strokeOpacity="0.4"
						strokeDasharray="2 5"
					/>
					<text
						x={PAD.left - 8}
						y={y(floor) + 3.5}
						textAnchor="end"
						fill={`rgb(${TIER_RGB[index] ?? TIER_RGB[3]})`}
						fillOpacity="0.8"
						style={{ fontSize: 10.5, fontFamily: "ui-monospace, monospace" }}
					>
						{floor}
					</text>
				</g>
			))}

			{paths.map((segment) => (
				<polyline
					key={`${segment.tier}-${segment.points.slice(0, 12)}`}
					points={segment.points}
					fill="none"
					stroke={`rgb(${TIER_RGB[Math.max(0, segment.tier - 1)] ?? TIER_RGB[0]})`}
					strokeWidth="2.25"
					strokeLinecap="square"
				/>
			))}

			{FLOORS.width.slice(1).map((floor, index) => {
				const months = crossing(floor);
				if (months > RUN_MONTHS) return null;
				return (
					<rect
						key={`cross-${floor}`}
						x={x(months) - 3.5}
						y={y(floor) - 3.5}
						width="7"
						height="7"
						fill={`rgb(${TIER_RGB[index + 1] ?? TIER_RGB[3]})`}
						shapeRendering="crispEdges"
					/>
				);
			})}

			{YEAR_TICKS.map((tick) => (
				<g key={tick.label}>
					<line
						x1={x(tick.months)}
						x2={x(tick.months)}
						y1={H - PAD.bottom + 3}
						y2={H - PAD.bottom + 9}
						stroke="currentColor"
						strokeWidth="0.5"
						className="text-border"
					/>
					<text
						x={x(tick.months)}
						y={H - 9}
						textAnchor={
							tick.months === 0
								? "start"
								: tick.months === RUN_MONTHS
									? "end"
									: "middle"
						}
						fill="currentColor"
						className="text-muted-foreground"
						style={{
							fontSize: 10,
							fontFamily: "ui-monospace, monospace",
							letterSpacing: "0.16em",
						}}
					>
						{tick.label}
					</text>
				</g>
			))}
		</svg>
	);
}
