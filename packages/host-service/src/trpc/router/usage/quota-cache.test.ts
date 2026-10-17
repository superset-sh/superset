import { expect, test } from "bun:test";
import { createQuotaCache } from "./quota-cache";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

test("same-slot rotation invalidates a valid five-minute cache", async () => {
	let account = "A";
	let loads = 0;
	let clock = 0;
	const cache = createQuotaCache(
		async () => {
			const captured = account;
			return {
				revision: captured,
				load: async () => {
					loads++;
					return captured;
				},
			};
		},
		300_000,
		() => clock,
	);
	expect(await cache.get()).toBe("A");
	clock = 1;
	expect(await cache.get()).toBe("A");
	expect(loads).toBe(1);
	account = "B";
	expect(await cache.get()).toBe("B");
	expect(loads).toBe(2);
	clock = 300_001;
	expect(await cache.get()).toBe("B");
	expect(loads).toBe(3);
});

test("normal and forced callers coalesce the same credential revision", async () => {
	const ready = deferred<void>();
	const response = deferred<string>();
	let loads = 0;
	const cache = createQuotaCache(
		async () => ({
			revision: "A",
			load: () => {
				loads++;
				ready.resolve();
				return response.promise;
			},
		}),
		300_000,
	);
	const first = cache.get();
	await ready.promise;
	const second = cache.get(true);
	const third = cache.get();
	response.resolve("A");
	expect(await Promise.all([first, second, third])).toEqual(["A", "A", "A"]);
	expect(loads).toBe(1);
});

test("late A is rejected for its caller and cannot replace a completed B", async () => {
	let account = "A";
	const ready = deferred<void>();
	const response = deferred<string>();
	const cache = createQuotaCache(async () => {
		const captured = account;
		return {
			revision: captured,
			load: () => {
				if (captured === "A") {
					ready.resolve();
					return response.promise;
				}
				return Promise.resolve(captured);
			},
		};
	}, 300_000);
	const old = cache.get().catch((error: Error) => error.message);
	await ready.promise;
	account = "B";
	expect(await cache.get(true)).toBe("B");
	response.resolve("A");
	expect(await old).toContain("changed during");
	expect(await cache.get()).toBe("B");
});

test("rotation during an unobserved request refuses its result", async () => {
	let account = "A";
	const ready = deferred<void>();
	const response = deferred<string>();
	const cache = createQuotaCache(
		async () => ({
			revision: account,
			load: () => {
				ready.resolve();
				return response.promise;
			},
		}),
		300_000,
	);
	const old = cache.get().catch((error: Error) => error.message);
	await ready.promise;
	account = "B";
	response.resolve("A");
	expect(await old).toContain("changed during");
});

test("A to B to A cannot read B through an earlier captured A snapshot", async () => {
	let account = "A";
	const ready = deferred<void>();
	const continueLoad = deferred<void>();
	const loaded: string[] = [];
	const cache = createQuotaCache(async () => {
		const captured = account;
		return {
			revision: captured,
			load: async () => {
				ready.resolve();
				await continueLoad.promise;
				loaded.push(captured);
				return captured;
			},
		};
	}, 300_000);
	const result = cache.get();
	await ready.promise;
	account = "B";
	continueLoad.resolve();
	account = "A";
	expect(await result).toBe("A");
	expect(loaded).toEqual(["A"]);
});

test("unreadable credentials evict quota and never reveal the reader error", async () => {
	let unavailable = false;
	let loads = 0;
	const cache = createQuotaCache(async () => {
		if (unavailable) throw new Error("synthetic-secret-must-not-escape");
		return { revision: "A", load: async () => ++loads };
	}, 300_000);
	expect(await cache.get()).toBe(1);
	unavailable = true;
	await expect(cache.get()).rejects.toThrow(
		"Quota credentials could not be verified. Try again.",
	);
	unavailable = false;
	expect(await cache.get()).toBe(2);
});

test("an observed A to B to A change does not revive the first A request", async () => {
	let account = "A";
	let firstA = true;
	const ready = deferred<void>();
	const response = deferred<string>();
	const cache = createQuotaCache(async () => {
		const captured = account;
		return {
			revision: captured,
			load: async () => {
				if (captured === "A" && firstA) {
					firstA = false;
					ready.resolve();
					return response.promise;
				}
				return `${captured}-new`;
			},
		};
	}, 300_000);
	const old = cache.get().catch((error: Error) => error.message);
	await ready.promise;
	account = "B";
	expect(await cache.get()).toBe("B-new");
	account = "A";
	expect(await cache.get()).toBe("A-new");
	response.resolve("A-old");
	expect(await old).toContain("changed during");
	expect(await cache.get()).toBe("A-new");
});

test("a response is refused if credentials become unreadable while it is pending", async () => {
	let unavailable = false;
	const ready = deferred<void>();
	const response = deferred<string>();
	const cache = createQuotaCache(async () => {
		if (unavailable) throw new Error("synthetic read failure");
		return {
			revision: "A",
			load: () => {
				ready.resolve();
				return response.promise;
			},
		};
	}, 300_000);
	const result = cache.get().catch((error: Error) => error.message);
	await ready.promise;
	unavailable = true;
	response.resolve("A");
	expect(await result).toBe(
		"Quota credentials could not be verified. Try again.",
	);
});

test("provider failure evicts the earlier cached value and can retry", async () => {
	let fail = false;
	let loads = 0;
	const cache = createQuotaCache(
		async () => ({
			revision: "A",
			load: async () => {
				loads++;
				if (fail) throw new Error("offline");
				return loads;
			},
		}),
		300_000,
	);
	expect(await cache.get()).toBe(1);
	fail = true;
	await expect(cache.get(true)).rejects.toThrow("offline");
	fail = false;
	expect(await cache.get()).toBe(3);
});

test("explicit invalidation refuses an earlier pending request", async () => {
	const ready = deferred<void>();
	const response = deferred<string>();
	const cache = createQuotaCache(
		async () => ({
			revision: "A",
			load: () => {
				ready.resolve();
				return response.promise;
			},
		}),
		300_000,
	);
	const result = cache.get().catch((error: Error) => error.message);
	await ready.promise;
	cache.invalidate();
	response.resolve("A");
	expect(await result).toContain("changed during");
});
