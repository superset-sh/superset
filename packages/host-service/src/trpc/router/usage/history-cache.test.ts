import { describe, expect, test } from "bun:test";
import type { UsageHistory } from "./history/aggregate";
import { createUsageHistoryCache } from "./history-cache";

const history = (usd: number) => ({ totals: { usd } }) as UsageHistory;

function deferred() {
	let resolve!: (value: UsageHistory) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<UsageHistory>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createUsageHistoryCache", () => {
	test("returns immediately and starts one scan while one is running", async () => {
		const cache = createUsageHistoryCache({
			ttlMs: 1000,
			retryAfterMs: 100,
			now: () => 0,
		});
		const scan = deferred();
		let scans = 0;
		const start = () => {
			scans++;
			return scan.promise;
		};

		expect(cache.get(30, start)).toEqual({
			history: null,
			computedAt: null,
			scanning: true,
			failed: false,
		});
		cache.get(30, start);
		await flush();
		expect(scans).toBe(1);

		scan.resolve(history(5));
		await flush();
		expect(cache.get(30, start)).toMatchObject({
			history: history(5),
			computedAt: 0,
			scanning: false,
		});
	});

	test("serves the stale result while it refreshes after the ttl", async () => {
		let clock = 0;
		const cache = createUsageHistoryCache({
			ttlMs: 1000,
			retryAfterMs: 100,
			now: () => clock,
		});
		const first = deferred();
		cache.get(7, () => first.promise);
		first.resolve(history(1));
		await flush();

		clock = 1000;
		const second = deferred();
		expect(cache.get(7, () => second.promise)).toMatchObject({
			history: history(1),
			scanning: true,
		});
	});

	test("keeps the last result and reports a failed scan", async () => {
		let clock = 0;
		const cache = createUsageHistoryCache({
			ttlMs: 1000,
			retryAfterMs: 100,
			now: () => clock,
		});
		const first = deferred();
		cache.get(7, () => first.promise);
		first.resolve(history(1));
		await flush();

		clock = 1000;
		const second = deferred();
		cache.get(7, () => second.promise);
		second.reject(new Error("scan failed"));
		await flush();

		expect(cache.get(7, () => deferred().promise)).toMatchObject({
			history: history(1),
			failed: true,
		});
	});
	test("records a synchronous scan error as a failure", async () => {
		const cache = createUsageHistoryCache({
			ttlMs: 1000,
			retryAfterMs: 100,
			now: () => 0,
		});
		expect(() =>
			cache.get(7, () => {
				throw new Error("db read failed");
			}),
		).not.toThrow();
		await flush();
		expect(cache.get(7, () => deferred().promise)).toMatchObject({
			failed: true,
			scanning: false,
		});
	});

	test("waits for the retry delay after a failed scan", async () => {
		let clock = 0;
		const cache = createUsageHistoryCache({
			ttlMs: 1000,
			retryAfterMs: 100,
			now: () => clock,
		});
		const failing = deferred();
		cache.get(7, () => failing.promise);
		failing.reject(new Error("scan failed"));
		await flush();

		let scans = 0;
		const start = () => {
			scans++;
			return deferred().promise;
		};
		clock = 99;
		cache.get(7, start);
		await flush();
		expect(scans).toBe(0);
		clock = 100;
		cache.get(7, start);
		await flush();
		expect(scans).toBe(1);
	});
});
