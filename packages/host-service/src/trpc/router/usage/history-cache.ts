import type { UsageHistory } from "./history/aggregate";

export interface CachedUsageHistory {
	history: UsageHistory | null;
	computedAt: number | null;
	scanning: boolean;
	failed: boolean;
}

interface Entry {
	history: UsageHistory | null;
	computedAt: number | null;
	inFlight: Promise<void> | null;
	failed: boolean;
	retryAt: number;
}

export function createUsageHistoryCache({
	ttlMs,
	retryAfterMs,
	now = Date.now,
}: {
	ttlMs: number;
	retryAfterMs: number;
	now?: () => number;
}) {
	const entries = new Map<number, Entry>();

	function refresh(entry: Entry, scan: () => Promise<UsageHistory>) {
		entry.inFlight = Promise.resolve()
			.then(scan)
			.then((history) => {
				entry.history = history;
				entry.computedAt = now();
				entry.failed = false;
			})
			.catch(() => {
				entry.failed = true;
				entry.retryAt = now() + retryAfterMs;
			})
			.finally(() => {
				entry.inFlight = null;
			});
	}

	return {
		get(days: number, scan: () => Promise<UsageHistory>): CachedUsageHistory {
			let entry = entries.get(days);
			if (!entry) {
				entry = {
					history: null,
					computedAt: null,
					inFlight: null,
					failed: false,
					retryAt: 0,
				};
				entries.set(days, entry);
			}
			const stale =
				entry.computedAt === null || now() - entry.computedAt >= ttlMs;
			if (stale && !entry.inFlight && now() >= entry.retryAt) {
				refresh(entry, scan);
			}
			return {
				history: entry.history,
				computedAt: entry.computedAt,
				scanning: entry.inFlight !== null,
				failed: entry.failed,
			};
		},
	};
}
