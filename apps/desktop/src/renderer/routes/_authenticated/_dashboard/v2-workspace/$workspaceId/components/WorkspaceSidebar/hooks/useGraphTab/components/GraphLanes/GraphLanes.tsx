import type { GraphEdge, GraphRowModel } from "../../types";
import { graphGeometry } from "./constants";

interface GraphLanesProps {
	row: GraphRowModel;
	compact: boolean;
	/** Visible lanes; see laneCapForWidth. Lanes past this collapse onto the last one. */
	laneCap: number;
	/**
	 * Extra height above the node, added by a two-line row's badge line. Lanes
	 * span the whole row so edges stay continuous, but the node tracks the
	 * subject — the line the commit actually is.
	 */
	topOffset?: number;
}

/** Vertical dimensions of one row's lane strip. */
interface LaneDims {
	height: number;
	/** Node centre. Not height/2 once a badge line sits on top. */
	yc: number;
	elbowRadius: number;
}

function laneColor(index: number): string {
	return `var(--graph-lane-${index})`;
}

/**
 * Merges and forks are drawn deliberately asymmetrically: a merge descends
 * then bends into the node horizontally, a fork leaves the node horizontally
 * then bends down. That is what tells them apart at a 3.5px node.
 */
function edgePath(
	edge: GraphEdge,
	dims: LaneDims,
	x: (lane: number) => number,
): string {
	const { height, yc, elbowRadius: e } = dims;
	const x0 = x(edge.fromLane);
	const x1 = x(edge.toLane);
	const dir = Math.sign(x1 - x0) || 1;

	switch (edge.kind) {
		case "pass":
			return `M${x0},0 V${height}`;
		case "in-straight":
			return `M${x0},0 V${yc}`;
		case "in-merge":
			return `M${x0},0 V${yc - e} Q${x0},${yc} ${x0 + dir * e},${yc} H${x1}`;
		case "out-straight":
			return `M${x0},${yc} V${height}`;
		case "out-stub":
			// 60% of the way from the node to the bottom edge, whatever the height.
			return `M${x0},${yc} V${yc + (height - yc) * 0.6}`;
		case "out-fork":
			return `M${x0},${yc} H${x1 - dir * e} Q${x1},${yc} ${x1},${yc + e} V${height}`;
	}
}

/** Per-row inline SVG, sized to this row only, so virtualization stays trivial. */
export function GraphLanes({
	row,
	compact,
	laneCap,
	topOffset = 0,
}: GraphLanesProps) {
	const geo = graphGeometry(compact);
	const shownLanes = Math.min(row.laneCount, laneCap);
	const width = shownLanes * geo.pitch + 4;
	const height = geo.rowHeight + topOffset;
	const yc = topOffset + geo.rowHeight / 2;
	const dims: LaneDims = { height, yc, elbowRadius: geo.elbowRadius };

	// Lanes past the cap collapse onto the last visible one rather than
	// scrolling sideways, which would desync from the subject column.
	const x = (lane: number) =>
		Math.min(lane, laneCap - 1) * geo.pitch + geo.pitch / 2;

	const nodeX = x(row.lane);
	const nodeColor = laneColor(row.color);

	return (
		<svg
			aria-hidden="true"
			className="shrink-0"
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
		>
			<title>Commit graph lanes</title>
			{row.edges.map((edge) => (
				<path
					key={`${edge.kind}-${edge.fromLane}-${edge.toLane}`}
					d={edgePath(edge, dims, x)}
					fill="none"
					stroke={laneColor(edge.color)}
					strokeWidth={geo.strokeWidth}
					strokeLinecap="round"
					{...(edge.kind === "out-stub"
						? { strokeDasharray: "2 2", opacity: 0.55 }
						: {})}
				/>
			))}

			{row.isMerge || row.isRoot ? (
				<circle cx={nodeX} cy={yc} r={geo.nodeRadius} fill={nodeColor} />
			) : (
				<circle
					cx={nodeX}
					cy={yc}
					r={geo.nodeRadius}
					// Filled with the row's own ground so the ring reads as a donut.
					className="fill-sidebar"
					stroke={nodeColor}
					strokeWidth={1.5}
				/>
			)}
			{row.isRoot && (
				<circle
					cx={nodeX}
					cy={yc}
					r={geo.nodeRadius + 2}
					fill="none"
					stroke={nodeColor}
					strokeWidth={1}
					opacity={0.45}
				/>
			)}
		</svg>
	);
}
