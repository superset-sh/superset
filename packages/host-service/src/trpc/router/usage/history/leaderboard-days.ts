import type { UsageAgent } from "../types";
import { collectUsageEntries } from "./entries";
import { type FactoryDay, groupFactoryDays } from "./factory-days";
import type { UsageLogEntry } from "./parse";
import { costUsd, matchModelRate, PRICING_TABLE_UPDATED } from "./pricing";

export interface LeaderboardDay {
	day: string;
	/** Public leaderboard API compatibility field. Internally this value is an
	 * agent; the server schema still calls it `provider`. */
	provider: UsageAgent;
	model: string;
	uncachedInput: number;
	cachedInput: number;
	cacheWrite5m: number;
	cacheWrite1h: number;
	output: number;

	reasoningOutput: number;

	usdEstimate: number;

	approximate: boolean;
	sessions: number;
}

export interface LeaderboardPayload {
	payloadVersion: 2;
	pricingTableUpdated: string;
	days: LeaderboardDay[];

	factoryDays: FactoryDay[];
}

function utcDayKey(timestampMs: number): string {
	return new Date(timestampMs).toISOString().slice(0, 10);
}

export function utcMidnightCutoff(days: number, now: Date): number {
	const start = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
	start.setUTCDate(start.getUTCDate() - (days - 1));
	return start.getTime();
}

interface Bucket extends Omit<LeaderboardDay, "sessions"> {
	sessionIds: Set<string>;
}

export function groupEntriesByDay(entries: UsageLogEntry[]): LeaderboardDay[] {
	const buckets = new Map<string, Bucket>();

	for (const entry of entries) {
		const day = utcDayKey(entry.timestampMs);
		const key = `${day}|${entry.agent}|${entry.model}`;

		let bucket = buckets.get(key);
		if (!bucket) {
			bucket = {
				day,
				provider: entry.agent,
				model: entry.model,
				uncachedInput: 0,
				cachedInput: 0,
				cacheWrite5m: 0,
				cacheWrite1h: 0,
				output: 0,
				reasoningOutput: 0,
				usdEstimate: 0,
				approximate: false,
				sessionIds: new Set(),
			};
			buckets.set(key, bucket);
		}

		const rate = matchModelRate(
			entry.agent,
			entry.model,
			entry.uncachedInput + entry.cachedInput,
		);
		bucket.uncachedInput += entry.uncachedInput;
		bucket.cachedInput += entry.cachedInput;
		bucket.cacheWrite5m += entry.cacheWrite5m;
		bucket.cacheWrite1h += entry.cacheWrite1h;
		bucket.output += entry.output;
		bucket.reasoningOutput += entry.reasoningOutput;
		bucket.usdEstimate += entry.costUsd ?? costUsd(rate, entry);

		bucket.approximate ||= entry.costUsd === undefined && rate.approximate;
		bucket.sessionIds.add(entry.sessionId);
	}

	return [...buckets.values()]
		.map(({ sessionIds, ...rest }) => ({
			...rest,

			sessions: sessionIds.size,
			usdEstimate: Number(rest.usdEstimate.toFixed(6)),
		}))
		.sort((a, b) =>
			a.day === b.day ? a.model.localeCompare(b.model) : a.day < b.day ? -1 : 1,
		);
}

export async function computeLeaderboardPayload(
	days: number,
	agentPrsByDay: Record<string, number> = {},
	now: Date = new Date(),
): Promise<LeaderboardPayload> {
	const { entries } = await collectUsageEntries(
		days,
		utcMidnightCutoff(days, now),
	);

	return {
		payloadVersion: 2,
		pricingTableUpdated: PRICING_TABLE_UPDATED,
		days: groupEntriesByDay(entries),
		factoryDays: groupFactoryDays(entries, agentPrsByDay),
	};
}
