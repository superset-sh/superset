import type { StarHistoryPoint } from "../getStarHistory";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

export interface PeriodDelta {
	date: string;
	newStars: number;
	perDay: number;
	/** True for the current, still-in-progress period. */
	isPartial: boolean;
	/** newStars extrapolated to a full period; equals newStars when !isPartial. */
	projectedTotal: number;
}

const MIN_DAYS = 1 / 24;

// Buckets are always labeled exactly `periodMs` apart, but the very last one
// covers however much of the current period has actually elapsed — not a
// full period. Dividing its star count by the full period anyway understates
// "now" (e.g. 3 days into a 7-day week, dividing by 7 reads as roughly half
// the true daily pace).
export function computePeriodDeltas(
	points: StarHistoryPoint[],
	periodMs: number = WEEK_MS,
): PeriodDelta[] {
	const now = Date.now();
	const deltas: PeriodDelta[] = [];
	for (let i = 1; i < points.length; i++) {
		const prev = points[i - 1];
		const curr = points[i];
		if (!prev || !curr) continue;

		const isLast = i === points.length - 1;
		const bucketStart = new Date(curr.date).getTime();
		// Only the true current period is ever less than a full period old —
		// a last point from an arbitrary (e.g. user-filtered) range that's
		// actually long past should still be treated as a complete period.
		const elapsedMs = isLast
			? Math.min(periodMs, Math.max(0, now - bucketStart))
			: periodMs;
		const isPartial = isLast && elapsedMs < periodMs;
		const days = Math.max(MIN_DAYS, elapsedMs / 86_400_000);

		const newStars = Math.max(0, curr.stars - prev.stars);
		const perDay = newStars / days;
		const periodDays = periodMs / 86_400_000;
		deltas.push({
			date: curr.date,
			newStars,
			perDay,
			isPartial,
			projectedTotal: isPartial ? Math.round(perDay * periodDays) : newStars,
		});
	}
	return deltas;
}

export interface PaceStats {
	peak: { perDay: number; date: string } | null;
	current: {
		perDay: number;
		date: string;
		isPartial: boolean;
		projectedTotal: number;
	} | null;
}

export function computePaceStats(deltas: PeriodDelta[]): PaceStats {
	if (deltas.length === 0) return { peak: null, current: null };
	// A still-in-progress period's rate is an extrapolation, not a measured
	// rate — a handful of stars minutes into a new week can otherwise spike
	// to a number that beats every real, completed week. Only fall back to
	// including it if there's no completed period to compare yet.
	const completed = deltas.filter((d) => !d.isPartial);
	const peakCandidates = completed.length > 0 ? completed : deltas;
	const peak = peakCandidates.reduce((max, d) =>
		d.perDay > max.perDay ? d : max,
	);
	const current = deltas[deltas.length - 1] ?? null;
	return {
		peak: { perDay: peak.perDay, date: peak.date },
		current: current
			? {
					perDay: current.perDay,
					date: current.date,
					isPartial: current.isPartial,
					projectedTotal: current.projectedTotal,
				}
			: null,
	};
}

function startOfWeekUTC(date: Date): Date {
	const d = new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
	const daysSinceMonday = (d.getUTCDay() + 6) % 7;
	d.setUTCDate(d.getUTCDate() - daysSinceMonday);
	return d;
}

function toISODate(t: number): string {
	return new Date(t).toISOString().slice(0, 10);
}

// `point.date` strings are UTC-midnight-anchored (see getStarHistory.ts).
// `new Date("yyyy-mm-dd")` parses as UTC midnight too, but a date-picker's
// Calendar constructs selections at LOCAL midnight — comparing those two
// directly drifts by a day for any non-UTC visitor. These treat a
// "yyyy-mm-dd" string purely as a calendar day, independent of timezone, by
// always going through the local Date constructor on both sides.
export function parseLocalDate(dateStr: string): Date {
	const [year, month, day] = dateStr.split("-").map(Number);
	return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function toLocalDateString(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

// Formats a UTC-midnight-anchored timestamp (chart data) as that same
// calendar day everywhere, regardless of the viewer's own timezone. Without
// this, toLocaleDateString renders in local time, so anyone west of UTC
// (e.g. the Americas) sees every axis tick, tooltip, and "week of" caption
// one calendar day earlier than the actual bucketed date.
export function formatUTCDate(
	timestamp: number,
	options: Intl.DateTimeFormatOptions,
): string {
	return new Date(timestamp).toLocaleDateString("en-US", {
		...options,
		timeZone: "UTC",
	});
}

// Rolls daily points up to one-per-Monday. Each point's value is cumulative
// *through the end of that week* — its date labels the period's START, but
// the value is "as of" the period's END — which is what computePeriodDeltas
// assumes: consecutive points differ by exactly one period's worth of real
// elapsed time, so (curr.stars - prev.stars) is exactly that period's star
// count. (Using each Monday's OWN cumulative as its value, instead, would
// make a delta between two Mondays span parts of three different weeks —
// the trap the original version of this function fell into.) The final
// week is still in progress, so it's valued at today's live total instead
// of a week-end that hasn't happened yet; computePeriodDeltas already knows
// to treat a partial last period specially.
export function aggregateToWeekly(
	dailyPoints: StarHistoryPoint[],
): StarHistoryPoint[] {
	if (dailyPoints.length === 0) return [];
	const last = dailyPoints[dailyPoints.length - 1];
	const first = dailyPoints[0];
	if (!last || !first) return [];

	const byDate = new Map(dailyPoints.map((p) => [p.date, p.stars]));
	const currentWeekStart = toISODate(
		startOfWeekUTC(new Date(last.date)).getTime(),
	);
	const firstMonday = startOfWeekUTC(new Date(first.date)).getTime();

	const weekly: StarHistoryPoint[] = [];
	for (let t = firstMonday; toISODate(t) < currentWeekStart; t += WEEK_MS) {
		const monday = toISODate(t);
		const weekEnd = toISODate(t + WEEK_MS - DAY_MS);
		const stars = byDate.get(weekEnd) ?? byDate.get(monday);
		if (stars !== undefined) weekly.push({ date: monday, stars });
	}

	weekly.push({ date: currentWeekStart, stars: last.stars });
	return weekly;
}
