import {
	differenceInDays,
	differenceInMinutes,
	isToday,
	isYesterday,
} from "date-fns";

export function activityDateGroup(timestamp: number, now = new Date()): string {
	const date = new Date(timestamp);
	if (differenceInMinutes(now, date) < 60) return "Now";
	if (isToday(date)) return "Today";
	if (isYesterday(date)) return "Yesterday";
	if (differenceInDays(now, date) < 7) return "This week";
	if (differenceInDays(now, date) < 30) return "This month";
	return "Older";
}
