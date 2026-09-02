import { i18n } from "@superset/i18n";
import {
	differenceInDays,
	differenceInMinutes,
	isToday,
	isYesterday,
} from "date-fns";

export function activityDateGroup(timestamp: number, now = new Date()): string {
	const date = new Date(timestamp);
	if (differenceInMinutes(now, date) < 60)
		return i18n._({ id: "mobile.activityGroup.now", message: "Now" });
	if (isToday(date))
		return i18n._({ id: "mobile.activityGroup.today", message: "Today" });
	if (isYesterday(date))
		return i18n._({
			id: "mobile.activityGroup.yesterday",
			message: "Yesterday",
		});
	if (differenceInDays(now, date) < 7)
		return i18n._({
			id: "mobile.activityGroup.thisWeek",
			message: "This week",
		});
	if (differenceInDays(now, date) < 30)
		return i18n._({
			id: "mobile.activityGroup.thisMonth",
			message: "This month",
		});
	return i18n._({ id: "mobile.activityGroup.older", message: "Older" });
}
