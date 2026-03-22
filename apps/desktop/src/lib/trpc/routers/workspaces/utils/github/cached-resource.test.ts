import { describe, expect, test } from "bun:test";
import { createCachedResource } from "./cached-resource";

describe("createCachedResource", () => {
	test("returns stale values immediately while refreshing in the background", async () => {
		const resource = createCachedResource<number>({
			ttlMs: 10,
			maxEntries: 10,
		});
		const originalDateNow = Date.now;
		const refreshControl: { resolve: (value: number) => void } = {
			resolve: () => {},
		};
		const refreshPromise = new Promise<number>((resolve) => {
			refreshControl.resolve = resolve;
		});

		Date.now = () => 1000;
		resource.set("status", 1);
		Date.now = () => 1011;

		try {
			expect(await resource.read("status", () => refreshPromise)).toBe(1);

			refreshControl.resolve(2);
			await refreshPromise;

			expect(resource.get("status")).toBe(2);
		} finally {
			Date.now = originalDateNow;
			resource.invalidate("status");
		}
	});

	test("forceFresh waits for the refreshed value when cache is stale", async () => {
		const resource = createCachedResource<number>({
			ttlMs: 10,
			maxEntries: 10,
		});
		const originalDateNow = Date.now;

		Date.now = () => 1000;
		resource.set("status", 1);
		Date.now = () => 1011;

		try {
			expect(
				await resource.read("status", async () => 2, { forceFresh: true }),
			).toBe(2);
			expect(resource.get("status")).toBe(2);
		} finally {
			Date.now = originalDateNow;
			resource.invalidate("status");
		}
	});

	test("forceFresh bypasses fresh cached values", async () => {
		const resource = createCachedResource<number>({
			ttlMs: 10,
			maxEntries: 10,
		});
		const originalDateNow = Date.now;

		Date.now = () => 1000;
		resource.set("status", 1);

		try {
			expect(
				await resource.read("status", async () => 2, { forceFresh: true }),
			).toBe(2);
			expect(resource.get("status")).toBe(2);
		} finally {
			Date.now = originalDateNow;
			resource.invalidate("status");
		}
	});

	test("evicts stale cached values when refreshed values should not be cached", async () => {
		const resource = createCachedResource<number | null>({
			ttlMs: 10,
			maxEntries: 10,
		});
		const originalDateNow = Date.now;

		Date.now = () => 1000;
		resource.set("status", 1);
		Date.now = () => 1011;

		try {
			expect(
				await resource.read("status", async () => null, {
					forceFresh: true,
					shouldCache: (value) => value !== null,
				}),
			).toBeNull();
			expect(resource.getState("status")).toBeNull();
		} finally {
			Date.now = originalDateNow;
			resource.invalidate("status");
		}
	});

	test("does not let invalidated requests overwrite newer cached values", async () => {
		const resource = createCachedResource<number>({
			ttlMs: 10,
			maxEntries: 10,
		});
		const olderControl: { resolve: (value: number) => void } = {
			resolve: () => {},
		};
		const olderPromise = new Promise<number>((resolve) => {
			olderControl.resolve = resolve;
		});

		const olderReadPromise = resource.read("status", () => olderPromise, {
			forceFresh: true,
		});
		resource.invalidate("status");

		expect(
			await resource.read("status", async () => 2, { forceFresh: true }),
		).toBe(2);

		olderControl.resolve(1);
		expect(await olderReadPromise).toBe(1);
		expect(resource.get("status")).toBe(2);
	});
});
