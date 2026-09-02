import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";

/** Formats the time until a quota window resets, e.g. "2d 4h", "3h 12m", "14m". */
export function formatResetIn(resetsAt: Date, now: Date = new Date()): string {
	const diffMs = resetsAt.getTime() - now.getTime();
	if (diffMs <= 0) {
		return i18n._(msg({ message: "now" }));
	}

	const totalMinutes = Math.ceil(diffMs / 60_000);
	const days = Math.floor(totalMinutes / (60 * 24));
	const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
	const minutes = totalMinutes % 60;

	if (days > 0) {
		return hours > 0
			? i18n._(
					msg({
						message: `${days}d ${hours}h`,
					}),
				)
			: i18n._(msg({ message: `${days}d` }));
	}
	if (hours > 0) {
		return minutes > 0
			? i18n._(
					msg({
						message: `${hours}h ${minutes}m`,
					}),
				)
			: i18n._(msg({ message: `${hours}h` }));
	}
	return i18n._(msg({ message: `${minutes}m` }));
}

/**
 * Full reset caption: countdown plus the absolute time — clock time when the
 * reset lands within 24h, date otherwise. e.g. "Resets in 2h 10m · 3:22 PM",
 * "Resets in 5d 13h · Aug 21".
 */
export function formatResetLabel(
	resetsAt: Date,
	now: Date = new Date(),
): string {
	const diffMs = resetsAt.getTime() - now.getTime();
	if (diffMs <= 0) {
		return i18n._(msg({ message: "Resets now" }));
	}

	const within24h = diffMs < 24 * 60 * 60 * 1000;
	const absolute = within24h
		? resetsAt.toLocaleTimeString(undefined, {
				hour: "numeric",
				minute: "2-digit",
			})
		: resetsAt.toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
			});
	const countdown = formatResetIn(resetsAt, now);
	return i18n._(
		msg({
			message: `Resets in ${countdown} · ${absolute}`,
		}),
	);
}
