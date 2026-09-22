import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

export function formatRangeLabel(
	range: DateRange | undefined,
	fallback: string,
	pattern = "MMM d",
): string {
	if (!range?.from) return fallback;
	const label = (date: Date) => format(date, pattern);
	return range.to
		? `${label(range.from)} – ${label(range.to)}`
		: label(range.from);
}
