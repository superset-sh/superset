import { resolveModelRate } from "../pricing-table";
import type { CostStats, DailyBucket, ProviderId } from "../usage-snapshot";

export interface UsageEntry {
	timestamp: Date;
	model: string;
	sessionId: string;
	inputTokens: number;
	outputTokens: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

function localDateKey(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function entryUsd(
	providerId: ProviderId,
	entry: UsageEntry,
): { usd: number; approximate: boolean } {
	const resolved = resolveModelRate(providerId, entry.model);
	if (!resolved) return { usd: 0, approximate: true };
	const usd =
		(entry.inputTokens / 1_000_000) * resolved.rate.inputPerMillion +
		(entry.outputTokens / 1_000_000) * resolved.rate.outputPerMillion;
	return { usd, approximate: resolved.approximate };
}

export function aggregateUsage(
	providerId: ProviderId,
	entries: UsageEntry[],
): CostStats {
	const now = new Date();
	const todayKey = localDateKey(now);
	const cutoff = now.getTime() - WINDOW_DAYS * DAY_MS;

	const buckets = new Map<string, DailyBucket>();
	for (let i = 0; i < WINDOW_DAYS; i++) {
		const key = localDateKey(new Date(now.getTime() - i * DAY_MS));
		buckets.set(key, { date: key, tokens: 0, usd: 0 });
	}

	const tokensByModel = new Map<string, number>();
	let todayUsd = 0;
	let thirtyDayUsd = 0;
	let thirtyDayTokens = 0;
	let approximate = false;

	let latestTimestamp = 0;
	let latestSessionId: string | null = null;
	const tokensBySession = new Map<string, number>();

	for (const entry of entries) {
		const tokens = entry.inputTokens + entry.outputTokens;
		const time = entry.timestamp.getTime();

		if (time > latestTimestamp) {
			latestTimestamp = time;
			latestSessionId = entry.sessionId;
		}
		tokensBySession.set(
			entry.sessionId,
			(tokensBySession.get(entry.sessionId) ?? 0) + tokens,
		);

		if (time < cutoff) continue;

		const { usd, approximate: entryApproximate } = entryUsd(providerId, entry);
		if (entryApproximate) approximate = true;

		thirtyDayUsd += usd;
		thirtyDayTokens += tokens;
		tokensByModel.set(
			entry.model,
			(tokensByModel.get(entry.model) ?? 0) + tokens,
		);

		const key = localDateKey(entry.timestamp);
		if (key === todayKey) todayUsd += usd;
		const bucket = buckets.get(key);
		if (bucket) {
			bucket.tokens += tokens;
			bucket.usd += usd;
		}
	}

	let topModel: string | null = null;
	let topModelTokens = -1;
	for (const [model, tokens] of tokensByModel) {
		if (tokens > topModelTokens) {
			topModelTokens = tokens;
			topModel = model;
		}
	}

	const dailyBuckets = [...buckets.values()].sort((a, b) =>
		a.date.localeCompare(b.date),
	);

	return {
		todayUsd,
		thirtyDayUsd,
		thirtyDayTokens,
		latestSessionTokens: latestSessionId
			? (tokensBySession.get(latestSessionId) ?? 0)
			: 0,
		topModel,
		dailyBuckets,
		estimatedFromLogs: true,
		approximate,
	};
}
