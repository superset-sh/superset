import { msg } from "@lingui/core/macro";
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
		return i18n._(msg({ message: "Now" }));
	if (isToday(date)) return i18n._(msg({ message: "Today" }));
	if (isYesterday(date))
		return i18n._(
			msg({
				message: "Yesterday",
			}),
		);
	if (differenceInDays(now, date) < 7)
		return i18n._(
			msg({
				message: "This week",
			}),
		);
	if (differenceInDays(now, date) < 30)
		return i18n._(
			msg({
				message: "This month",
			}),
		);
	return i18n._(msg({ message: "Older" }));
}
