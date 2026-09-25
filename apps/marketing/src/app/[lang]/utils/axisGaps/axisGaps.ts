import type { AxisGap, AxisName } from "@superset/trpc/leaderboard-tier";
import { formatCount, formatTokens, formatUsd } from "../formatUsage";

export function axisValue(axis: AxisName, value: number): string {
	if (value <= 0 && axis === "cost") return "—";
	if (axis === "depth") return formatTokens(value);
	if (axis === "cost") return formatUsd(value);
	if (axis === "width") return value.toFixed(1);
	if (axis === "output") return String(Math.round(value));
	return formatCount(value);
}

export function fill(gap: AxisGap): number {
	if (gap.needed <= 0) return 1;
	if (gap.lowerIsBetter) {
		if (gap.current <= 0) return 0;
		return Math.min(1, gap.needed / gap.current);
	}
	return Math.min(1, gap.current / gap.needed);
}

export function laggingGaps(gaps: AxisGap[], limit: number): AxisGap[] {
	return gaps
		.filter((gap) => !gap.met)
		.sort((a, b) => fill(a) - fill(b))
		.slice(0, limit);
}
