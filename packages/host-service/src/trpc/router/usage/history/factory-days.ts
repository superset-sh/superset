import type { UsageLogEntry } from "./parse";

export interface FactoryDay {
	day: string;

	sessions: number;

	parallelSessions: number;
	agentPrsMerged: number;
}

const BUCKET_MS = 15 * 60_000;

function utcDayKey(timestampMs: number): string {
	return new Date(timestampMs).toISOString().slice(0, 10);
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
	return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

interface DayBucket {
	sessions: Set<string>;
	buckets: Map<number, Set<string>>;
}

export function groupFactoryDays(
	entries: UsageLogEntry[],
	agentPrsByDay: Record<string, number> = {},
): FactoryDay[] {
	const days = new Map<string, DayBucket>();

	for (const entry of entries) {
		const day = utcDayKey(entry.timestampMs);
		let bucket = days.get(day);
		if (!bucket) {
			bucket = { sessions: new Set(), buckets: new Map() };
			days.set(day, bucket);
		}
		bucket.sessions.add(entry.sessionId);

		const slot = Math.floor(entry.timestampMs / BUCKET_MS);
		let slotSessions = bucket.buckets.get(slot);
		if (!slotSessions) {
			slotSessions = new Set();
			bucket.buckets.set(slot, slotSessions);
		}
		slotSessions.add(entry.sessionId);
	}

	for (const day of Object.keys(agentPrsByDay)) {
		if (!days.has(day)) {
			days.set(day, { sessions: new Set(), buckets: new Map() });
		}
	}

	return [...days.entries()]
		.map(([day, bucket]) => ({
			day,
			sessions: bucket.sessions.size,
			parallelSessions: median(
				[...bucket.buckets.values()].map((sessions) => sessions.size),
			),
			agentPrsMerged: agentPrsByDay[day] ?? 0,
		}))
		.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}
