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

interface PixelIconProps {
	art: readonly string[];
	size?: number;
	className?: string;
}

export function PixelIcon({ art, size = 18, className = "" }: PixelIconProps) {
	const grid = art.length;
	if (grid === 0) return null;

	return (
		<svg
			aria-hidden="true"
			width={size}
			height={size}
			viewBox={`0 0 ${grid} ${grid}`}
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
