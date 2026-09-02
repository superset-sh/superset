export const LEADERBOARD_PERIODS = [
	"day",
	"7d",
	"30d",
	"week",
	"month",
	"all",
] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: string): boolean {
	if (!DAY_KEY.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return (
		!Number.isNaN(parsed.getTime()) &&
		parsed.toISOString().slice(0, 10) === value
	);
}

export const MAX_WINDOW_DAYS = 366;

export interface DayRange {
	from: string;

	to: string;
}

function toDayKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function parseDayKey(day: string): Date {
	return new Date(`${day}T00:00:00.000Z`);
}

function startOfWeek(date: Date): Date {
	const start = new Date(date);
	const weekday = (start.getUTCDay() + 6) % 7;
	start.setUTCDate(start.getUTCDate() - weekday);
	return start;
}

function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

export function resolveDayRange(
	period: LeaderboardPeriod,
	periodStart?: string,
	now: Date = new Date(),
): DayRange | null {
	if (period === "all") return null;

	const anchor = periodStart ? parseDayKey(periodStart) : now;
	if (Number.isNaN(anchor.getTime())) {
		throw new Error(`Invalid periodStart: ${periodStart}`);
	}

	if (period === "day") {
		const day = toDayKey(anchor);
		return { from: day, to: day };
	}

	if (period === "7d" || period === "30d") {
		const span = period === "7d" ? 7 : 30;
		return {
			from: toDayKey(addDays(anchor, -(span - 1))),
			to: toDayKey(anchor),
		};
	}

	if (period === "week") {
		const start = startOfWeek(anchor);
		return { from: toDayKey(start), to: toDayKey(addDays(start, 6)) };
	}

	const start = new Date(
		Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1),
	);
	const end = new Date(
		Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0),
	);
	return { from: toDayKey(start), to: toDayKey(end) };
}

function clampSpan(range: DayRange): DayRange {
	const earliest = toDayKey(
		addDays(parseDayKey(range.to), -(MAX_WINDOW_DAYS - 1)),
	);
	return range.from < earliest ? { from: earliest, to: range.to } : range;
}

export function resolveWindow(opts: {
	period: LeaderboardPeriod;
	periodStart?: string;
	from?: string;
	to?: string;
	now?: Date;
}): DayRange | null {
	if (opts.from && opts.to) {
		const ordered =
			opts.from <= opts.to
				? { from: opts.from, to: opts.to }
				: { from: opts.to, to: opts.from };
		return clampSpan(ordered);
	}
	return resolveDayRange(opts.period, opts.periodStart, opts.now ?? new Date());
}
