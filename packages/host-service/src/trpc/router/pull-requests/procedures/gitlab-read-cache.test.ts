import { expect, test } from "bun:test";
import { GitLabReadCache } from "./gitlab-read-cache";

test("cache sweeps distinct expired reads and bounds retained content", async () => {
	let now = 0;
	const cache = new GitLabReadCache<string>({
		now: () => now,
		maxEntries: 2,
		maxBytes: 5,
		size: (value) => value.length,
		ttlMs: 10,
	});
	let reads = 0;
	const read = () => Promise.resolve(String(++reads));
	await cache.read("a", read);
	await cache.read("b", read);
	await cache.read("c", read);
	expect(cache.size).toBe(2);
	await cache.read("a", read);
	expect(reads).toBe(4);
	now = 20;
	await cache.read("d", read);
	expect(cache.size).toBe(1);
	await cache.read("large", () => Promise.resolve("oversized"));
	expect(cache.size).toBe(1);
});
test("inflight reads deduplicate across TTL and invalidation cannot replace a newer result", async () => {
	let now = 0;
	const cache = new GitLabReadCache<string>({ now: () => now, ttlMs: 10 });
	const pending = Promise.withResolvers<string>();
	const first = cache.read("a", () => pending.promise);
	now = 20;
	expect(cache.read("a", () => Promise.resolve("unexpected"))).toBe(first);
	cache.delete("a");
	await cache.read("a", () => Promise.resolve("new"));
	pending.resolve("old");
	await first;
	expect(await cache.read("a", () => Promise.resolve("unexpected"))).toBe(
		"new",
	);
});
