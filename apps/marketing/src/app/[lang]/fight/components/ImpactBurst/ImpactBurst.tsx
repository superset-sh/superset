const SHARDS = [
	{ x: 15, y: 2, w: 2, h: 6 },
	{ x: 15, y: 24, w: 2, h: 6 },
	{ x: 2, y: 15, w: 6, h: 2 },
	{ x: 24, y: 15, w: 6, h: 2 },
	{ x: 6, y: 6, w: 4, h: 4 },
	{ x: 22, y: 6, w: 4, h: 4 },
	{ x: 6, y: 22, w: 4, h: 4 },
	{ x: 22, y: 22, w: 4, h: 4 },
];

interface ImpactBurstProps {
	crit: boolean;
}

export function ImpactBurst({ crit }: ImpactBurstProps) {
	const core = crit ? "rgb(255,206,84)" : "rgb(255,255,255)";
	const ring = crit ? "rgb(210,86,17)" : "rgb(214,64,52)";

	return (
		<svg
			viewBox="0 0 32 32"
			aria-hidden="true"
			shapeRendering="crispEdges"
			className="fight-burst pointer-events-none absolute left-1/2 top-1/2 w-28 h-28 -translate-x-1/2 -translate-y-1/2 z-20"
		>
			<rect x={12} y={12} width={8} height={8} fill={core} />
			<rect
				x={9}
				y={9}
				width={14}
				height={14}
				fill="none"
				stroke={ring}
				strokeWidth={2}
			/>
			{SHARDS.map((shard) => (
				<rect
					key={`${shard.x}-${shard.y}`}
					x={shard.x}
					y={shard.y}
					width={shard.w}
					height={shard.h}
					fill={ring}
				/>
			))}
		</svg>
	);
}
