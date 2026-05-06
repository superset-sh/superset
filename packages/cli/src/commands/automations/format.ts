import { formatDateTimeInTimezone } from "@superset/shared/rrule";

export function formatAutomationDate(
	value: Date | string | null | undefined,
	timezone: string | null | undefined,
): string {
	if (!value) return "—";
	const date = value instanceof Date ? value : new Date(value);
	if (!Number.isFinite(date.getTime())) return "—";

	return formatDateTimeInTimezone(date, timezone || "UTC");
}
