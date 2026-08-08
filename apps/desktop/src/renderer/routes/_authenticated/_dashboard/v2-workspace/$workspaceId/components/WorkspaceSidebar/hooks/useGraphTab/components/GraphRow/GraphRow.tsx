import { cn } from "@superset/ui/utils";
import type { MouseEvent } from "react";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import type { GraphRef, GraphRowModel } from "../../types";
import { GraphLanes, graphGeometry, refLineHeight } from "../GraphLanes";
import { RefBadge } from "../RefBadge";

interface GraphRowProps {
	row: GraphRowModel;
	compact: boolean;
	selected: boolean;
	/** Shift-click marks a range; both endpoints render as selected. */
	onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
	/** Pin the preview pane a single click just opened. */
	onDoubleClick?: (event: MouseEvent<HTMLButtonElement>) => void;
	laneCap: number;
	/** Only the wide breakpoint has room for a date column. */
	showDate: boolean;
	/** Rows between two range endpoints get a stronger wash. */
	inRange?: boolean;
	/** Merge subjects are structure, not work — dim them. */
	muteMerges?: boolean;
	/**
	 * Give refs their own line above the subject, untruncated. Only changes
	 * rows that actually carry refs — the rest stay single-line, which is why
	 * the virtualizer's estimateSize has to be index-based (graphRowHeight).
	 */
	twoLineRefs?: boolean;
	/**
	 * Recede under the unreferenced filter. Dimmed rather than removed —
	 * dropping rows would leave the surviving lane edges dangling.
	 */
	dimmed?: boolean;
}

// Fixed order so the eye lands on the same thing in every row.
const REF_RANK: Record<string, number> = {
	head: 0,
	open: 1,
	"detached-worktree": 2,
	prunable: 3,
	"orphan-branch": 4,
	merged: 5,
};

function refRank(graphRef: GraphRef): number {
	if (graphRef.type === "head") return 0;
	if (graphRef.type === "remote") return 6;
	if (graphRef.type === "tag") return 7;
	return REF_RANK[graphRef.state ?? "merged"] ?? 5;
}

export function GraphRow({
	row,
	compact,
	selected,
	onSelect,
	onDoubleClick,
	laneCap,
	showDate,
	inRange = false,
	muteMerges = true,
	twoLineRefs = false,
	dimmed = false,
}: GraphRowProps) {
	const { commit } = row;
	const laneVar = `var(--graph-lane-${row.color})`;

	const sortedRefs = [...commit.refs].sort((a, b) => refRank(a) - refRank(b));
	// A ref line has the width to itself, so it shows every badge in full. The
	// slice + "+N" chip only exist to stop inline badges eating the subject.
	const ownLine = twoLineRefs && sortedRefs.length > 0;
	const maxBadges = compact ? 2 : 3;
	const shownRefs = ownLine ? sortedRefs : sortedRefs.slice(0, maxBadges);
	const hiddenRefs = ownLine ? [] : sortedRefs.slice(maxBadges);

	const geo = graphGeometry(compact);
	const refLine = ownLine ? refLineHeight(compact) : 0;

	const laneOverflow = Math.max(0, row.laneCount - laneCap);
	// Selection has to outrank the range band it anchors: endpoints carry
	// --accent, the rows between them do not, so giving both the same 16% keeps
	// the endpoints strictly brighter. 9% elsewhere stays under --accent's own
	// contribution, so an unselected tinted row never competes with a selected one.
	const tintAlpha = inRange || selected ? 16 : 9;
	const tint = `color-mix(in oklch, ${laneVar} ${tintAlpha}%, transparent)`;

	// One strip, two homes: its own line above the subject, or inline ahead of
	// it. On its own line it clips rather than wrapping, so the row height stays
	// a function of the index alone.
	const refStrip =
		shownRefs.length > 0 ? (
			<span
				className={cn(
					"flex min-w-0 items-center gap-[3px]",
					ownLine ? "overflow-hidden" : "shrink-0",
				)}
				style={ownLine ? { height: refLine } : undefined}
			>
				{shownRefs.map((graphRef) => (
					<RefBadge
						key={`${graphRef.type}:${graphRef.name}`}
						graphRef={graphRef}
						compact={compact}
						laneColor={row.color}
						untrimmed={ownLine}
					/>
				))}
				{hiddenRefs.length > 0 && (
					<span
						title={hiddenRefs.map((r) => r.name).join(", ")}
						className={cn(
							"inline-flex shrink-0 items-center rounded-sm border border-border px-1 font-medium font-mono text-muted-foreground",
							compact ? "h-3.5 text-[10px]" : "h-4 text-[11px]",
							"leading-none",
						)}
					>
						+{hiddenRefs.length}
					</span>
				)}
			</span>
		) : null;

	return (
		<button
			type="button"
			onClick={onSelect}
			onDoubleClick={onDoubleClick}
			title={commit.message}
			className={cn(
				"relative flex w-full items-stretch gap-1.5 border-0 pr-2 text-left",
				"hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
				selected && "bg-accent",
				dimmed && "opacity-40",
			)}
			style={{
				height: geo.rowHeight + refLine,
				// Lane membership stays readable without tracing lines, and it
				// survives the lane compression that narrow widths force.
				//
				// This is background-*image*, not -color, on purpose: an inline
				// backgroundColor outranks a class-set one, which silently killed
				// hover:bg-accent. As an image the tint layers over whatever ground
				// the hover/selected classes set, and still paints below content.
				backgroundImage: `linear-gradient(${tint}, ${tint})`,
			}}
		>
			{selected && (
				<span
					aria-hidden="true"
					className="absolute inset-y-0 left-0 w-0.5"
					style={{ backgroundColor: laneVar }}
				/>
			)}

			<GraphLanes
				row={row}
				compact={compact}
				laneCap={laneCap}
				topOffset={refLine}
			/>

			<span className="flex min-w-0 flex-1 flex-col">
				{ownLine && refStrip}

				<span className="flex min-w-0 flex-1 items-center gap-1.5">
					{laneOverflow > 0 && (
						<span className="-ml-1 shrink-0 font-mono text-[9px] text-muted-foreground">
							+{laneOverflow}
						</span>
					)}

					{!ownLine && refStrip}

					<span
						className={cn(
							"min-w-0 flex-1 truncate",
							compact ? "text-[11px]" : "text-xs",
							row.isMerge && muteMerges
								? "text-muted-foreground"
								: "text-foreground",
							// Must follow the text-size class; see RefBadge.
							"leading-none",
						)}
					>
						{commit.message}
					</span>

					{!compact && (
						<span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
							{commit.shortHash}
						</span>
					)}
					{showDate && (
						<span className="min-w-10 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
							{formatRelativeTime(Date.parse(commit.date))}
						</span>
					)}
				</span>
			</span>
		</button>
	);
}
