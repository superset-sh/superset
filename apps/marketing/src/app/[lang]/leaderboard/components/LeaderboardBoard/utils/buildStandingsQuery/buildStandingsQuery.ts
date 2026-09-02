import type { StandingsQuery } from "@/app/[lang]/utils/fetchLeaderboard";
import type { RangeSelection } from "../../components/RangeTabs";

function toDayKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildStandingsQuery(
	selection: RangeSelection,
	metric?: StandingsQuery["metric"],
): StandingsQuery {
	const custom = selection.custom;
	const range: StandingsQuery =
		custom?.from && custom?.to
			? { from: toDayKey(custom.from), to: toDayKey(custom.to) }
			: { period: selection.period };
	return metric ? { ...range, metric } : range;
}
