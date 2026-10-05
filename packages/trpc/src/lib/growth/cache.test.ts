import { describe, expect, mock, test } from "bun:test";
import { createGrowthMetricCache } from "./cache";

function setup() {
	const values = new Map<string, unknown>();
	const work: Promise<unknown>[] = [];
	const write = mock(async <T>(key: string, value: T, _ttl: number) => {
		values.set(key, value);
	});
	const cache = createGrowthMetricCache({
		read: async <T>(key: string) => (values.get(key) as T) ?? null,
		write,
		claim: async (key, value) => {
			if (values.has(key)) return false;
			values.set(key, value);
			return true;
		},
		background: (promise) => work.push(promise),
	});
	return { cache, values, work, write };
}

describe("growth metric cache", () => {
	test("concurrent cold requests share a fetch and later requests use the cache", async () => {
		const { cache } = setup();
		const result = { available: true, points: [1] };
		const compute = mock(async () => result);
		expect(
			await Promise.all([
				cache("stars", 60, compute),
				cache("stars", 60, compute),
			]),
		).toEqual([result, result]);
		expect(await cache("stars", 60, compute)).toEqual(result);
		expect(compute).toHaveBeenCalledTimes(1);
	});

	test("returns stale data immediately and only one instance refreshes it", async () => {
		const { cache, values, work } = setup();
		values.set("growth:stars:stale", "old");
		const deferred = Promise.withResolvers<string>();
		const compute = mock(() => deferred.promise);
		expect(await cache("stars", 60, compute, { staleTtlSeconds: 600 })).toBe(
			"old",
		);
		expect(await cache("stars", 60, compute, { staleTtlSeconds: 600 })).toBe(
			"old",
		);
		deferred.resolve("new");
		await Promise.all(work);
		expect(compute).toHaveBeenCalledTimes(1);
		expect(values.get("growth:stars")).toBe("new");
		expect(values.get("growth:stars:stale")).toBe("new");
	});

	test("failed refreshes preserve the last good chart", async () => {
		const { cache, values, work } = setup();
		values.set("growth:stars:stale", { available: true });
		await cache("stars", 60, async () => ({ available: false }), {
			staleTtlSeconds: 600,
		});
		await Promise.all(work);
		expect(values.has("growth:stars")).toBe(false);
		expect(values.get("growth:stars:stale")).toEqual({ available: true });
	});

	test("a rejected cold fetch can be retried", async () => {
		const { cache } = setup();
		await expect(
			cache("stars", 60, async () => {
				throw new Error("upstream");
			}),
		).rejects.toThrow("upstream");
		expect(await cache("stars", 60, async () => "recovered")).toBe("recovered");
	});
});
