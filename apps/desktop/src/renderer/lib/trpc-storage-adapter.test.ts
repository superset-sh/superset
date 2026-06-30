import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createTrpcStorageAdapter } from "./trpc-storage-adapter";

// The adapter caches pending snapshots in localStorage; stub it for bun.
function installLocalStorageStub(): Map<string, string> {
	const store = new Map<string, string>();
	(globalThis as Record<string, unknown>).localStorage = {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
		removeItem: (key: string) => {
			store.delete(key);
		},
	};
	return store;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const snapshot = (state: Record<string, unknown>) =>
	JSON.stringify({ state, version: 1 });

describe("createTrpcStorageAdapter — suppressed writes", () => {
	let localStorageStub: Map<string, string>;

	beforeEach(() => {
		localStorageStub = installLocalStorageStub();
	});

	afterEach(() => {
		delete (globalThis as Record<string, unknown>).localStorage;
	});

	it("drops the write and persists nothing while suppression is active", async () => {
		const writes: unknown[] = [];
		let suppress = true;
		const adapter = createTrpcStorageAdapter({
			get: async () => null,
			set: async (input) => {
				writes.push(input);
			},
			shouldSuppressWrite: () => suppress,
		});

		await adapter.setItem("tabs", snapshot({ tabs: ["remote"] }));
		await sleep(10);

		expect(writes).toEqual([]);

		// After suppression lifts, a NEW value persists normally.
		suppress = false;
		await adapter.setItem("tabs", snapshot({ tabs: ["local"] }));
		await sleep(10);

		expect(writes).toEqual([{ tabs: ["local"] }]);
	});

	it("skips a later identical local write (suppressed value counts as flushed)", async () => {
		const writes: unknown[] = [];
		let suppress = true;
		const adapter = createTrpcStorageAdapter({
			get: async () => null,
			set: async (input) => {
				writes.push(input);
			},
			shouldSuppressWrite: () => suppress,
		});

		const merged = snapshot({ tabs: ["merged"] });
		await adapter.setItem("tabs", merged);
		suppress = false;
		// zustand re-emits the same state after the remote apply settles.
		await adapter.setItem("tabs", merged);
		await sleep(10);

		expect(writes).toEqual([]);
	});

	it("cancels a pre-merge local write queued in the debounce window", async () => {
		const writes: unknown[] = [];
		let suppress = false;
		const adapter = createTrpcStorageAdapter({
			get: async () => null,
			set: async (input) => {
				writes.push(input);
			},
			writeDebounceMs: 30,
			shouldSuppressWrite: () => suppress,
		});

		// Local write enters the debounce window…
		await adapter.setItem("tabs", snapshot({ tabs: ["stale-local"] }));
		// …then a remote broadcast merges and its echo write is suppressed.
		suppress = true;
		await adapter.setItem("tabs", snapshot({ tabs: ["merged"] }));
		suppress = false;

		// Wait past the debounce: the stale local write must NOT flush —
		// flushing it would persist and re-broadcast pre-merge state.
		await sleep(80);
		expect(writes).toEqual([]);
		// The pending localStorage snapshot is cleared too.
		expect(localStorageStub.get("tabs:pending")).toBeUndefined();
	});
});
