import { describe, expect, it } from "bun:test";
import {
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import { z } from "zod";
import { withQuotaGuard } from "./withQuotaGuard";

function quotaError(): Error {
	const error = new Error("exceeded the quota");
	error.name = "QuotaExceededError";
	return error;
}

/**
 * Map-backed store that refuses writes once the retained bytes exceed `limit`,
 * the way Chromium refuses once the origin's budget is gone.
 */
function makeQuotaLimitedStorage(limit: number) {
	const map = new Map<string, string>();
	const usedBytes = () => {
		let total = 0;
		for (const [key, value] of map) total += key.length + value.length;
		return total;
	};
	return {
		store: map,
		usedBytes,
		api: {
			getItem: (key: string) => map.get(key) ?? null,
			setItem: (key: string, value: string) => {
				const replaced = map.get(key)?.length ?? 0;
				if (usedBytes() - replaced + key.length + value.length > limit) {
					throw quotaError();
				}
				map.set(key, value);
			},
			removeItem: (key: string) => {
				map.delete(key);
			},
		},
	};
}

const noopEvents = {
	addEventListener: () => {},
	removeEventListener: () => {},
};

const rowSchema = z.object({ id: z.string(), payload: z.string() });
type Row = z.infer<typeof rowSchema>;

/** Let a mutation's transaction settle, since rollback happens off the call. */
const settleTransactions = () =>
	new Promise((resolve) => setTimeout(resolve, 0));

describe("withQuotaGuard", () => {
	it("writes straight through when there is room (identity)", () => {
		const storage = makeQuotaLimitedStorage(1000);
		let reclaimCalls = 0;
		const guarded = withQuotaGuard(
			{},
			{
				storage: storage.api,
				reclaim: () => {
					reclaimCalls += 1;
					return 0;
				},
				onPersistFailed: () => {},
			},
		) as { storage: typeof storage.api };

		guarded.storage.setItem("k", "v");

		expect(storage.store.get("k")).toBe("v");
		expect(reclaimCalls).toBe(0);
	});

	it("reclaims and retries, landing the write", () => {
		const storage = makeQuotaLimitedStorage(40);
		storage.store.set("terminal-buffer:gone", "x".repeat(20));
		const guarded = withQuotaGuard(
			{},
			{
				storage: storage.api,
				reclaim: () => {
					storage.store.delete("terminal-buffer:gone");
					return 1;
				},
				onPersistFailed: () => {
					throw new Error("should not be reached");
				},
			},
		) as { storage: typeof storage.api };

		guarded.storage.setItem("collection", "y".repeat(20));

		expect(storage.store.get("collection")).toBe("y".repeat(20));
		expect(storage.store.has("terminal-buffer:gone")).toBe(false);
	});

	it("fails soft when reclaim frees nothing", () => {
		const storage = makeQuotaLimitedStorage(10);
		const failures: string[] = [];
		const guarded = withQuotaGuard(
			{},
			{
				storage: storage.api,
				reclaim: () => 0,
				onPersistFailed: (key) => failures.push(key),
			},
		) as { storage: typeof storage.api };

		expect(() =>
			guarded.storage.setItem("collection", "z".repeat(100)),
		).not.toThrow();
		expect(failures).toEqual(["collection"]);
	});

	it("skips the retry when reclaim reports nothing freed", () => {
		const storage = makeQuotaLimitedStorage(10);
		let setItemCalls = 0;
		const counting = {
			...storage.api,
			setItem: (key: string, value: string) => {
				setItemCalls += 1;
				storage.api.setItem(key, value);
			},
		};
		const guarded = withQuotaGuard(
			{},
			{
				storage: counting,
				reclaim: () => 0,
				onPersistFailed: () => {},
			},
		) as { storage: typeof counting };

		guarded.storage.setItem("collection", "z".repeat(100));

		expect(setItemCalls).toBe(1);
	});

	it("fails soft when even the post-reclaim retry cannot fit", () => {
		const storage = makeQuotaLimitedStorage(30);
		storage.store.set("terminal-buffer:gone", "x".repeat(10));
		const failures: string[] = [];
		const guarded = withQuotaGuard(
			{},
			{
				storage: storage.api,
				reclaim: () => {
					storage.store.delete("terminal-buffer:gone");
					return 1;
				},
				onPersistFailed: (key) => failures.push(key),
			},
		) as { storage: typeof storage.api };

		expect(() =>
			guarded.storage.setItem("collection", "z".repeat(500)),
		).not.toThrow();
		expect(failures).toEqual(["collection"]);
	});

	it("rethrows failures that are not quota exhaustion", () => {
		const guarded = withQuotaGuard(
			{},
			{
				storage: {
					getItem: () => null,
					removeItem: () => {},
					setItem: () => {
						throw new DOMException("blocked", "SecurityError");
					},
				},
				reclaim: () => {
					throw new Error("reclaim must not run for non-quota errors");
				},
				onPersistFailed: () => {},
			},
		) as { storage: { setItem: (k: string, v: string) => void } };

		expect(() => guarded.storage.setItem("k", "v")).toThrow("blocked");
	});

	it("keeps an inserted row in memory when the write cannot land", async () => {
		// The regression that matters: TanStack DB rolls a transaction back when
		// persistence throws, the live query re-emits, and the effect that queued
		// the insert re-runs — a synchronous retry loop. A row that survives a
		// failed write proves the rollback no longer happens.
		//
		// The rollback is asynchronous: unguarded, the row is still present
		// synchronously after `insert` and only disappears once the transaction
		// settles. Asserting before that flush passes against broken code too, so
		// this test is only meaningful with the await below.
		const storage = makeQuotaLimitedStorage(60);
		const collection = createCollection(
			localStorageCollectionOptions(
				withQuotaGuard(
					{
						id: "quota-guard-rows",
						storageKey: "quota-guard-rows",
						schema: rowSchema,
						getKey: (item: Row) => item.id,
						storageEventApi: noopEvents,
					},
					{
						storage: storage.api,
						reclaim: () => 0,
						onPersistFailed: () => {},
					},
				),
			),
		);
		await collection.preload();

		collection.insert({ id: "row-1", payload: "p".repeat(200) });
		await settleTransactions();

		expect(collection.get("row-1")).toBeDefined();
	});
});

describe("cross-window storage events", () => {
	type Listener = (event: { key: string | null; storageArea: unknown }) => void;

	function withWindowShim<T>(
		run: (
			fire: (key: string, area: unknown) => void,
			shimLocalStorage: unknown,
		) => T,
	): T {
		const listeners = new Set<Listener>();
		const shimLocalStorage = {
			getItem: () => null,
			setItem: () => {},
			removeItem: () => {},
		};
		const shimWindow = {
			localStorage: shimLocalStorage,
			addEventListener: (type: string, listener: Listener) => {
				if (type === "storage") listeners.add(listener);
			},
			removeEventListener: (_type: string, listener: Listener) => {
				listeners.delete(listener);
			},
		};
		const hadWindow = "window" in globalThis;
		const previous = (globalThis as { window?: unknown }).window;
		(globalThis as { window?: unknown }).window = shimWindow;
		try {
			return run((key, area) => {
				for (const listener of [...listeners])
					listener({ key, storageArea: area });
			}, shimLocalStorage);
		} finally {
			if (hadWindow) (globalThis as { window?: unknown }).window = previous;
			else delete (globalThis as { window?: unknown }).window;
		}
	}

	it("re-targets another window's localStorage event at the guarded storage", () => {
		// The library's handler drops events whose storageArea is not the
		// collection's own storage object; without this re-targeting no
		// cross-window write is ever seen (the rename ghost-folder bug).
		withWindowShim((fire, shimLocalStorage) => {
			const options = withQuotaGuard(
				{ storageKey: "sync-test-key" },
				{ reclaim: () => 0, onPersistFailed: () => {} },
			) as unknown as {
				storage: unknown;
				storageEventApi?: {
					addEventListener(t: string, l: Listener): void;
					removeEventListener(t: string, l: Listener): void;
				};
			};
			expect(options.storageEventApi).toBeDefined();
			const seen: Array<{ key: string | null; storageArea: unknown }> = [];
			const listener: Listener = (event) => seen.push(event);
			options.storageEventApi?.addEventListener("storage", listener);

			fire("sync-test-key", shimLocalStorage);
			expect(seen).toHaveLength(1);
			expect(seen[0]?.storageArea).toBe(options.storage);
			expect(seen[0]?.key).toBe("sync-test-key");

			// A different storage area (another adapter) is not ours.
			fire("sync-test-key", {});
			expect(seen).toHaveLength(1);

			options.storageEventApi?.removeEventListener("storage", listener);
			fire("sync-test-key", shimLocalStorage);
			expect(seen).toHaveLength(1);
		});
	});

	it("does not install an event api over a custom (test) storage", () => {
		withWindowShim(() => {
			const custom = withQuotaGuard(
				{
					storageKey: "k",
					storage: {
						getItem: () => null,
						setItem: () => {},
						removeItem: () => {},
					},
				},
				{ reclaim: () => 0, onPersistFailed: () => {} },
			) as { storageEventApi?: unknown };
			expect(custom.storageEventApi).toBeUndefined();
		});
	});
});
