const GRID = 9;

const ART = [
	[
		"#########",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.#####.#",
		"#########",
	],
	[
		"#########",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.#####.#",
		"#.#####.#",
		"#########",
	],
	[
		"#########",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.......#",
		"#.#####.#",
		"#.#####.#",
		"#.#####.#",
		"#########",
	],
	[
		"#########",
		"#.......#",
		"#.#####.#",
		"#.#####.#",
		"#.#####.#",
		"#.#####.#",
		"#.#####.#",
		"#.#####.#",
		"#########",
	],
] as const;

const FRAME = [
	"#########",
	"#.......#",
	"#.......#",
	"#.......#",
	"#.......#",
	"#.......#",
	"#.......#",
	"#.......#",
	"#########",
] as const;

function rowRuns(row: string): Array<[number, number]> {
	const runs: Array<[number, number]> = [];
	let start = -1;
	for (let x = 0; x <= row.length; x++) {
		if (row[x] === "#") {
			if (start < 0) start = x;
		} else if (start >= 0) {
			runs.push([start, x - start]);
			start = -1;
		}
	}
	return runs;
}

interface TierIconProps {
	tier: number;

	size?: number;
	hollow?: boolean;
	className?: string;
}

export function TierIcon({
	tier,
	size = 18,
	hollow = false,
	className = "",
}: TierIconProps) {
	const art = hollow ? FRAME : ART[tier - 1];
	if (!art) return null;

	return (
		<svg
			aria-hidden="true"
			width={size}
			height={size}
			viewBox={`0 0 ${GRID} ${GRID}`}
			shapeRendering="crispEdges"
			className={`shrink-0 ${className}`}
		>
			{art.flatMap((row, y) =>
				rowRuns(row).map(([x, width]) => (
					<rect
						key={`${y}:${x}`}
						x={x}
						y={y}
						width={width}
						height={1}
						fill="currentColor"
					/>
				)),
			)}
		</svg>
	);
}
