import { cn } from "@superset/ui/utils";
import { GitBranch, Tag } from "lucide-react";
import type { GraphRef, GraphRefState } from "../../types";

interface RefBadgeProps {
	graphRef: GraphRef;
	compact: boolean;
	/** 1-8; only `open` badges tint themselves with their lane's colour. */
	laneColor: number;
	/**
	 * Drop the width cap. Only for a two-line row, where the badge owns the
	 * line and there is nothing left to starve — inline, the cap is what stops
	 * a long branch name from eating the subject.
	 */
	untrimmed?: boolean;
}

// State is encoded in texture as well as colour — fill means claimed, dashes
// mean stale, a strike means broken. That reads at 260px, survives a
// colourblind viewer, and leaves hue free for lane identity.
const STATE_CLASSES: Record<GraphRefState, string> = {
	open: "text-foreground",
	"detached-worktree": "border-dashed border-border text-muted-foreground",
	"orphan-branch":
		"px-0.5 text-muted-foreground underline decoration-dotted underline-offset-[3px]",
	prunable: "border-dashed border-destructive/60 text-destructive",
	merged: "bg-muted text-muted-foreground opacity-90",
};

function tooltip(graphRef: GraphRef): string {
	if (graphRef.state === "prunable" && graphRef.pruneReason) {
		return `${graphRef.name} — ${graphRef.pruneReason}`;
	}
	if (graphRef.worktreePath)
		return `${graphRef.name} — ${graphRef.worktreePath}`;
	return graphRef.name;
}

export function RefBadge({
	graphRef,
	compact,
	laneColor,
	untrimmed = false,
}: RefBadgeProps) {
	const base = cn(
		"inline-flex shrink-0 items-center gap-[3px] overflow-hidden text-ellipsis whitespace-nowrap rounded-sm border border-transparent px-[5px] font-medium font-mono text-muted-foreground",
		compact ? "h-3.5 text-[10px]" : "h-4 text-[11px]",
		!untrimmed && (compact ? "max-w-[8ch]" : "max-w-[12ch]"),
		// After the size classes: tailwind-merge treats an arbitrary text-[..]
		// as a font-size/line-height pair and drops an earlier leading-*.
		"leading-none",
	);

	if (graphRef.type === "head") {
		return (
			<span className={cn(base, "border-border font-semibold text-foreground")}>
				HEAD
			</span>
		);
	}

	const Icon = graphRef.type === "tag" ? Tag : GitBranch;
	const isOpen = graphRef.state === "open";

	return (
		<span
			className={cn(
				base,
				graphRef.state ? STATE_CLASSES[graphRef.state] : "border-border",
			)}
			style={
				isOpen
					? {
							backgroundColor: `color-mix(in oklch, var(--graph-lane-${laneColor}) 18%, transparent)`,
							borderColor: `color-mix(in oklch, var(--graph-lane-${laneColor}) 55%, transparent)`,
						}
					: undefined
			}
			title={tooltip(graphRef)}
		>
			<Icon
				className="shrink-0"
				size={10}
				strokeWidth={2}
				style={
					isOpen
						? { color: `var(--graph-lane-${laneColor})` }
						: { opacity: 0.75 }
				}
			/>
			<span
				className={cn(
					"overflow-hidden text-ellipsis",
					graphRef.state === "prunable" && "line-through",
				)}
			>
				{graphRef.name}
			</span>
		</span>
	);
}
