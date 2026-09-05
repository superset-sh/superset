export const CALENDAR_WEEKS = 53;
export const CALENDAR_LEVELS = 4;

const DAY_MS = 86_400_000;

export interface DailyTokens {
	day: string;
	tokens: number;
}

export interface CalendarCell {
	day: string;
	tokens: number;
	level: number;
	inRange: boolean;
}

export interface Calendar {
	weeks: CalendarCell[][];
	max: number;
	total: number;
	activeDays: number;
}

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function quartileLevel(
	tokens: number,
	sorted: readonly number[],
): number {
	if (tokens <= 0 || sorted.length === 0) return 0;

	const rank = sorted.filter((value) => value < tokens).length;
	const quartile = Math.floor((rank / sorted.length) * CALENDAR_LEVELS);
	return Math.min(CALENDAR_LEVELS, quartile + 1);
}

export function buildCalendar(
	daily: readonly DailyTokens[],
	endDay: string,
): Calendar {
	const tokensByDay = new Map<string, number>();
	for (const row of daily) {
		tokensByDay.set(row.day, (tokensByDay.get(row.day) ?? 0) + row.tokens);
	}

	const end = Date.parse(`${endDay}T00:00:00Z`);
	const endWeekday = new Date(end).getUTCDay();
	const lastSunday = end - endWeekday * DAY_MS;
	const start = lastSunday - (CALENDAR_WEEKS - 1) * 7 * DAY_MS;

	const inWindow: number[] = [];
	for (let ms = start; ms <= end; ms += DAY_MS) {
		const tokens = tokensByDay.get(dayKey(ms)) ?? 0;
		if (tokens > 0) inWindow.push(tokens);
	}
	const sorted = [...inWindow].sort((a, b) => a - b);

	const weeks: CalendarCell[][] = [];
	for (let week = 0; week < CALENDAR_WEEKS; week++) {
		const column: CalendarCell[] = [];
		for (let weekday = 0; weekday < 7; weekday++) {
			const ms = start + (week * 7 + weekday) * DAY_MS;
			const day = dayKey(ms);
			const tokens = tokensByDay.get(day) ?? 0;
			column.push({
				day,
				tokens,
				level: quartileLevel(tokens, sorted),
				inRange: ms <= end,
			});
		}
		weeks.push(column);
	}

	return {
		weeks,
		max: sorted.at(-1) ?? 0,
		total: inWindow.reduce((sum, tokens) => sum + tokens, 0),
		activeDays: inWindow.length,
	};
}
