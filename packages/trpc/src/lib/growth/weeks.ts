const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** ISO date of the Monday that starts the week containing `date`, in UTC. */
export function startOfWeek(date: Date): string {
	const daysSinceMonday = (date.getUTCDay() + 6) % 7;
	const monday = Date.UTC(
		date.getUTCFullYear(),
		date.getUTCMonth(),
		date.getUTCDate() - daysSinceMonday,
	);
	return new Date(monday).toISOString().slice(0, 10);
}

/** The last `count` week starts, oldest first, ending with the current week. */
export function weekStarts(count: number, now = new Date()): string[] {
	const current = Date.parse(`${startOfWeek(now)}T00:00:00Z`);
	return Array.from({ length: count }, (_, i) =>
		new Date(current - (count - 1 - i) * WEEK_MS).toISOString().slice(0, 10),
	);
}

export interface WeeklySeries {
	key: string;
	values: number[];
}

export interface WeeklyTable {
	weeks: string[];
	series: WeeklySeries[];
}

export type WeeklyRow = [week: string, key: string, value: number];

interface PivotOptions {
	// Keys to place first, in this order; anything else follows by total.
	order?: readonly string[];
	// Keep at most this many series, by total. Anything past the cut is
	// summed into `overflowKey` when one is given, otherwise dropped.
	limit?: number;
	overflowKey?: string;
}

// Turns long-format [week, key, value] rows into a dense table with one value
// per week and series, so charts do not draw gaps where a week had no rows.
export function pivotWeekly(
	rows: readonly WeeklyRow[],
	weeks: readonly string[],
	options: PivotOptions = {},
): WeeklyTable {
	const weekIndex = new Map(weeks.map((week, i) => [week, i]));
	const byKey = new Map<string, number[]>();
	for (const [week, key, value] of rows) {
		const index = weekIndex.get(week.slice(0, 10));
		if (index === undefined) continue;
		let values = byKey.get(key);
		if (!values) {
			values = new Array<number>(weeks.length).fill(0);
			byKey.set(key, values);
		}
		values[index] = (values[index] ?? 0) + Number(value ?? 0);
	}

	const total = (values: number[]) => values.reduce((sum, v) => sum + v, 0);
	const order = options.order ?? [];
	let series = [...byKey.entries()]
		.map(([key, values]) => ({ key, values }))
		.sort((a, b) => {
			const ai = order.indexOf(a.key);
			const bi = order.indexOf(b.key);
			if (ai !== -1 || bi !== -1) {
				return (
					(ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi)
				);
			}
			return total(b.values) - total(a.values);
		});

	if (options.limit !== undefined && series.length > options.limit) {
		const kept = series.slice(0, options.limit);
		const rest = series.slice(options.limit);
		if (options.overflowKey) {
			// A query may already emit a bucket with the overflow key; fold the
			// cut series into it rather than adding a second series of that name.
			const existing = kept.find((s) => s.key === options.overflowKey);
			const overflow =
				existing?.values ?? new Array<number>(weeks.length).fill(0);
			for (const s of rest) {
				s.values.forEach((v, i) => {
					overflow[i] = (overflow[i] ?? 0) + v;
				});
			}
			if (!existing) kept.push({ key: options.overflowKey, values: overflow });
		}
		series = kept;
	}

	return { weeks: [...weeks], series };
}
