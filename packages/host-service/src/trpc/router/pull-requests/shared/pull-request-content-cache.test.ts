import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import {
	evictPullRequestContent,
	pullRequestContentCacheKey,
	pullRequestContentCacheSize,
	readPullRequestContentCache,
	writePullRequestContentCache,
} from "./pull-request-content-cache";

const repo = { owner: "Octocat", name: "Hello" };

describe("pull request content cache", () => {
	afterEach(() => {
		setSystemTime();
	});

	test("the key ignores repository casing and keeps the number", () => {
		expect(pullRequestContentCacheKey(repo, 42)).toBe("octocat/hello#42");
	});

	test("serves the in-flight promise to later readers", () => {
		const key = pullRequestContentCacheKey(repo, 1);
		const promise = Promise.resolve({ state: "open" });
		writePullRequestContentCache(key, promise);
		expect(readPullRequestContentCache(key)).toBe(promise);
	});

	test("misses once the TTL has passed", () => {
		const key = pullRequestContentCacheKey(repo, 2);
		setSystemTime(new Date("2026-10-01T12:00:00Z"));
		writePullRequestContentCache(key, Promise.resolve({ state: "open" }));
		setSystemTime(new Date("2026-10-01T12:00:29Z"));
		expect(readPullRequestContentCache(key)).not.toBeNull();
		setSystemTime(new Date("2026-10-01T12:00:30Z"));
		expect(readPullRequestContentCache(key)).toBeNull();
	});

	test("expired entries are dropped on the next write, so the map holds only the last TTL", () => {
		// Far enough ahead that entries other tests wrote at the real clock
		// count as expired too: the cache is one module-wide map.
		try {
			setSystemTime(new Date("2030-01-01T00:00:00Z"));
			for (let n = 100; n < 110; n++) {
				writePullRequestContentCache(
					pullRequestContentCacheKey(repo, n),
					Promise.resolve({ state: "open" }),
				);
			}
			const before = pullRequestContentCacheSize();
			setSystemTime(new Date("2030-01-01T00:00:31Z"));
			writePullRequestContentCache(
				pullRequestContentCacheKey(repo, 110),
				Promise.resolve({ state: "open" }),
			);
			expect(before).toBeGreaterThanOrEqual(10);
			expect(pullRequestContentCacheSize()).toBe(1);
		} finally {
			// Entries stamped in 2030 would read as fresh to every later test.
			for (let n = 100; n <= 110; n++) evictPullRequestContent(repo, n);
		}
	});

	test("evicting a PR makes the next read miss, whatever the casing", () => {
		const key = pullRequestContentCacheKey(repo, 3);
		writePullRequestContentCache(key, Promise.resolve({ state: "open" }));
		evictPullRequestContent({ owner: "OCTOCAT", name: "hello" }, 3);
		expect(readPullRequestContentCache(key)).toBeNull();
	});

	test("a rejected fetch evicts itself", async () => {
		const key = pullRequestContentCacheKey(repo, 4);
		const failed = Promise.reject(new Error("gh timed out"));
		writePullRequestContentCache(key, failed);
		await failed.catch(() => {});
		expect(readPullRequestContentCache(key)).toBeNull();
	});

	test("a rejected fetch leaves a newer entry for the same PR alone", async () => {
		const key = pullRequestContentCacheKey(repo, 5);
		const failed = Promise.reject(new Error("gh timed out"));
		writePullRequestContentCache(key, failed);
		const retry = Promise.resolve({ state: "merged" });
		writePullRequestContentCache(key, retry);
		await failed.catch(() => {});
		expect(readPullRequestContentCache(key)).toBe(retry);
	});
});
