import { readMetricCache, writeMetricCache } from "../metric-cache";

const PREFIX = "growth";

// Third-party sources (GitHub, Discord, the sitemap, Search Console) are
// rate-limited or slow, and PostHog recomputes ad-hoc HogQL on every call, so
// every growth tile reads through the shared metric cache. Without Redis
// (local dev) this is a straight pass-through.
export async function cachedGrowthMetric<T>(
	key: string,
	ttlSeconds: number,
	compute: () => Promise<T>,
): Promise<T> {
	const cacheKey = `${PREFIX}:${key}`;
	const cached = await readMetricCache<T>(cacheKey);
	if (cached !== null) return cached;
	const value = await compute();
	// A source that answered "not configured" or "upstream error" should be
	// asked again next time, not remembered for the TTL: the fix (a secret,
	// an outage ending) would otherwise take an hour to show.
	if (isUnavailable(value)) return value;
	await writeMetricCache(cacheKey, value, ttlSeconds);
	return value;
}

function isUnavailable(value: unknown): boolean {
	return (
		typeof value === "object" &&
		value !== null &&
		"available" in value &&
		(value as { available: unknown }).available === false
	);
}
