import { describe, expect, it } from "bun:test";
import {
	type EvictableCollection,
	evictInactiveOrgs,
} from "./evictInactiveOrgs";

interface FakeCollection extends EvictableCollection {
	cleanupCalls: number;
}

function fakeCollection(
	behavior: "resolve" | "reject" = "resolve",
): FakeCollection {
	const collection: FakeCollection = {
		cleanupCalls: 0,
		cleanup() {
			collection.cleanupCalls += 1;
			return behavior === "reject"
				? Promise.reject(new Error("cleanup failed"))
				: Promise.resolve();
		},
	};
	return collection;
}

function fakeOrg(): Record<string, FakeCollection> {
	return { tasks: fakeCollection(), projects: fakeCollection() };
}

// Let queued fire-and-forget cleanup rejections settle their `.catch`.
const flushMicrotasks = () => Promise.resolve();

describe("evictInactiveOrgs", () => {
	it("leaves the active org untouched (identity)", () => {
		const active = fakeOrg();
		const cache = new Map([["org-A", active]]);

		const evicted = evictInactiveOrgs(cache, "org-A");

		expect(evicted).toEqual([]);
		expect(cache.has("org-A")).toBe(true);
		expect(active.tasks.cleanupCalls).toBe(0);
		expect(active.projects.cleanupCalls).toBe(0);
	});

	it("evicts a prior org: cleans up every collection and drops it", () => {
		const prior = fakeOrg();
		const active = fakeOrg();
		const cache = new Map([
			["org-A", prior],
			["org-B", active],
		]);

		const evicted = evictInactiveOrgs(cache, "org-B");

		expect(evicted).toEqual(["org-A"]);
		expect(cache.has("org-A")).toBe(false);
		expect(cache.has("org-B")).toBe(true);
		// Prior org fully torn down...
		expect(prior.tasks.cleanupCalls).toBe(1);
		expect(prior.projects.cleanupCalls).toBe(1);
		// ...active org never touched.
		expect(active.tasks.cleanupCalls).toBe(0);
		expect(active.projects.cleanupCalls).toBe(0);
	});

	it("is a no-op when only the active org is cached (same-org switch)", () => {
		const active = fakeOrg();
		const cache = new Map([["org-A", active]]);

		const evicted = evictInactiveOrgs(cache, "org-A");

		expect(evicted).toEqual([]);
		expect(cache.size).toBe(1);
		expect(active.tasks.cleanupCalls).toBe(0);
	});

	it("survives a collection whose cleanup rejects (failed switch)", async () => {
		const prior: Record<string, FakeCollection> = {
			tasks: fakeCollection("reject"),
			projects: fakeCollection("resolve"),
		};
		const active = fakeOrg();
		const cache = new Map([
			["org-A", prior],
			["org-B", active],
		]);
		const errors: Array<{
			orgKey: string;
			collectionName: string;
			error: unknown;
		}> = [];

		const evicted = evictInactiveOrgs(
			cache,
			"org-B",
			(orgKey, collectionName, error) => {
				errors.push({ orgKey, collectionName, error });
			},
		);

		// The rejecting collection does not abort the sweep.
		expect(evicted).toEqual(["org-A"]);
		expect(cache.has("org-A")).toBe(false);
		expect(prior.tasks.cleanupCalls).toBe(1);
		expect(prior.projects.cleanupCalls).toBe(1);

		await flushMicrotasks();
		expect(errors).toHaveLength(1);
		expect(errors[0]?.orgKey).toBe("org-A");
		// The failing collection is identified by name for traceable logs.
		expect(errors[0]?.collectionName).toBe("tasks");
		expect(errors[0]?.error).toBeInstanceOf(Error);
	});

	it("skips values without a cleanup() method (structural safety)", () => {
		const prior: Record<string, unknown> = {
			tasks: fakeCollection(),
			// A non-collection field must not crash the sweep.
			someConfig: { url: "x" },
			nullish: null,
		};
		const active = fakeOrg();
		const cache = new Map<string, Record<string, unknown>>([
			["org-A", prior],
			["org-B", active],
		]);

		const evicted = evictInactiveOrgs(cache, "org-B");

		expect(evicted).toEqual(["org-A"]);
		expect(cache.has("org-A")).toBe(false);
		expect((prior.tasks as FakeCollection).cleanupCalls).toBe(1);
	});

	it("never evicts the active org across a rapid A→B→A switch", () => {
		const orgA = fakeOrg();
		const orgB = fakeOrg();
		const cache = new Map<string, Record<string, FakeCollection>>([
			["org-A", orgA],
		]);

		// A active, switch to B: B gets cached (as getCollections would), evict A.
		cache.set("org-B", orgB);
		expect(evictInactiveOrgs(cache, "org-B")).toEqual(["org-A"]);
		expect(cache.has("org-A")).toBe(false);
		expect(orgA.tasks.cleanupCalls).toBe(1);
		expect(orgB.tasks.cleanupCalls).toBe(0);

		// Switch back to A: a FRESH A instance is recreated (recoverable), evict B.
		const orgAFresh = fakeOrg();
		cache.set("org-A", orgAFresh);
		expect(evictInactiveOrgs(cache, "org-A")).toEqual(["org-B"]);
		expect(cache.has("org-B")).toBe(false);
		expect(cache.has("org-A")).toBe(true);
		// The re-entered active org is never cleaned up.
		expect(orgAFresh.tasks.cleanupCalls).toBe(0);
		expect(orgB.tasks.cleanupCalls).toBe(1);
	});
});
