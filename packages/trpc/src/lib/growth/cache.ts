import { waitUntil } from "@vercel/functions";
import {
	claimMetricCache,
	readMetricCache,
	writeMetricCache,
} from "../metric-cache";

interface CacheDependencies {
	read: typeof readMetricCache;
	write: typeof writeMetricCache;
	claim: typeof claimMetricCache;
	background: (promise: Promise<unknown>) => void;
}

export function createGrowthMetricCache({
	read,
	write,
	claim,
	background,
}: CacheDependencies) {
	const pending = new Map<string, Promise<unknown>>();

	return async function cachedGrowthMetric<T>(
		key: string,
		ttlSeconds: number,
		compute: () => Promise<T>,
		{ staleTtlSeconds }: { staleTtlSeconds?: number } = {},
	): Promise<T> {
		const cacheKey = `growth:${key}`;
		const staleKey = `${cacheKey}:stale`;
		const cached = await read<T>(cacheKey);
		if (cached !== null) return cached;

		const refresh = (): Promise<T> => {
			const existing = pending.get(cacheKey);
			if (existing) return existing as Promise<T>;
			const work = (async () => {
				const value = await compute();
				if (isUnavailable(value)) return value;
				await write(cacheKey, value, ttlSeconds);
				if (staleTtlSeconds) await write(staleKey, value, staleTtlSeconds);
				return value;
			})();
			pending.set(cacheKey, work);
			return work.finally(() => pending.delete(cacheKey));
		};

		if (staleTtlSeconds) {
			const stale = await read<T>(staleKey);
			if (stale !== null) {
				background(
					(async () => {
						if (await claim(`${cacheKey}:refresh`, true, 120)) {
							await refresh();
						}
					})().catch((error) => {
						console.error(`[growth-cache] refresh failed for ${key}:`, error);
					}),
				);
				return stale;
			}
		}
		return refresh();
	};
}

export const cachedGrowthMetric = createGrowthMetricCache({
	read: readMetricCache,
	write: writeMetricCache,
	claim: claimMetricCache,
	background: waitUntil,
});

function isUnavailable(value: unknown): boolean {
	return (
		typeof value === "object" &&
		value !== null &&
		"available" in value &&
		(value as { available: unknown }).available === false
	);
}
