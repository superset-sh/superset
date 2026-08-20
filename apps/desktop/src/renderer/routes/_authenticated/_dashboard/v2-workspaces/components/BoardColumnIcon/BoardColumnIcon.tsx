import { cn } from "@superset/ui/utils";
import { LuCircleAlert, LuCircleCheck, LuCircleX } from "react-icons/lu";
import type { BoardColumnKey } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";

const RADIUS = 5;
const INNER_RADIUS = 2.6;

/** Wedge path from 12 o'clock, clockwise, filled to `fraction` of the pie. */
function piePath(fraction: number): string {
	const angle = 2 * Math.PI * fraction;
	const x = 8 + INNER_RADIUS * Math.sin(angle);
	const y = 8 - INNER_RADIUS * Math.cos(angle);
	const largeArc = fraction > 0.5 ? 1 : 0;
	return `M8,8 L8,${8 - INNER_RADIUS} A${INNER_RADIUS},${INNER_RADIUS} 0 ${largeArc},1 ${x},${y} Z`;
}

interface PieIconProps {
	fraction: number;
	className: string;
}

/** Linear-style workflow pie: outlined circle with a wedge filled to the
 * column's progress along the workflow. */
function PieIcon({ fraction, className }: PieIconProps) {
	return (
		// biome-ignore lint/a11y/noSvgWithoutTitle: Decorative — the consuming header/row supplies the accessible label.
		<svg viewBox="0 0 16 16" className={cn("size-3.5", className)} aria-hidden>
			<circle
				cx="8"
				cy="8"
				r={RADIUS}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
			/>
			{fraction > 0 ? <path d={piePath(fraction)} fill="currentColor" /> : null}
		</svg>
	);
}

interface BoardColumnIconProps {
	column: BoardColumnKey;
	className?: string;
}

/**
 * Group-header status icon shared by the board columns and the list's
 * status sections. Deliberately a different shape family from the row
 * glyphs (pulse dots / dashed rings) so headers never read as items.
 */
export function BoardColumnIcon({ column, className }: BoardColumnIconProps) {
	switch (column) {
		case "attention":
			return (
				<LuCircleAlert className={cn("size-3.5 text-red-500", className)} />
			);
		case "working":
			return (
				<PieIcon fraction={0.5} className={cn("text-amber-500", className)} />
			);
		case "review":
			return (
				<PieIcon
					fraction={0.75}
					className={cn("text-emerald-500", className)}
				/>
			);
		case "merged":
			return (
				<LuCircleCheck className={cn("size-3.5 text-violet-500", className)} />
			);
		case "deleted":
			return (
				<LuCircleX
					className={cn("size-3.5 text-muted-foreground/60", className)}
				/>
			);
		default:
			return (
				<PieIcon
					fraction={0}
					className={cn("text-muted-foreground/50", className)}
				/>
			);
	}
}
