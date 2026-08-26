import { formatDistanceToNowStrict } from "date-fns";

export function relativeTime(value: Date | number | string): string {
	if (Number.isNaN(new Date(value).getTime())) return "";
	return formatDistanceToNowStrict(value, { addSuffix: true });
}
