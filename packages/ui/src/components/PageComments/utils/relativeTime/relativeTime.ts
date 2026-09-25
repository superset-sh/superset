import { formatRelativeTime } from "@superset/i18n/format";

export function relativeTime(value: Date | number | string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return formatRelativeTime(date);
}
