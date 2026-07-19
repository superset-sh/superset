import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		keyboardLayout: {
			changes: { subscribe: () => {} },
		},
	},
}));

const { terminalRuntimeRegistry } = await import("./terminal-runtime-registry");
const { tryPersistRuntimeState } = await import("./terminal-runtime");

interface FakeStorageState {
	values: Map<string, string>;
	storage: Storage;
}

function createFakeStorage(): FakeStorageState {
	const values = new Map<string, string>();
	const storage = {
		get length() {
			return values.size;
		},
		clear: () => values.clear(),
		getItem: (key: string) => values.get(key) ?? null,
		key: (index: number) => Array.from(values.keys())[index] ?? null,
		removeItem: (key: string) => values.delete(key),
		setItem: (key: string, value: string) => values.set(key, value),
	} as Storage;
	return { values, storage };
}

const originalLocalStorage = globalThis.localStorage;
let fakeStorage: FakeStorageState;

beforeEach(() => {
	fakeStorage = createFakeStorage();
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: fakeStorage.storage,
	});
});

afterEach(() => {
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: originalLocalStorage,
	});
});

describe("terminalRuntimeRegistry eviction cleanup", () => {
	test("keeps a runtime when dimensions fail to persist", () => {
		const terminalId = "dimensions-write-failure";
		const setItem = fakeStorage.storage.setItem.bind(fakeStorage.storage);
		fakeStorage.storage.setItem = (key: string, value: string) => {
			if (key === `terminal-dims:${terminalId}`) {
				throw new Error("dimensions write failed");
			}
			setItem(key, value);
		};
		const runtime = {
			terminalId,
			serializeAddon: { serialize: () => "serialized scrollback" },
			lastCols: 120,
			lastRows: 32,
		};

		expect(
			tryPersistRuntimeState(
				runtime as Parameters<typeof tryPersistRuntimeState>[0],
			),
		).toBe(false);
		expect(fakeStorage.values.get(`terminal-buffer:${terminalId}`)).toBe(
			"serialized scrollback",
		);
		expect(fakeStorage.values.has(`terminal-dims:${terminalId}`)).toBe(false);
	});

	test("dispose clears persisted state even when eviction already removed the entry", () => {
		const terminalId = "evicted-terminal";
		fakeStorage.values.set(`terminal-buffer:${terminalId}`, "scrollback");
		fakeStorage.values.set(
			`terminal-dims:${terminalId}`,
			JSON.stringify({ cols: 120, rows: 32 }),
		);

		expect(terminalRuntimeRegistry.has(terminalId)).toBe(false);
		terminalRuntimeRegistry.dispose(terminalId);

		expect(fakeStorage.values.has(`terminal-buffer:${terminalId}`)).toBe(false);
		expect(fakeStorage.values.has(`terminal-dims:${terminalId}`)).toBe(false);
	});

	test("reschedules eviction when a parked terminal changes buffers", () => {
		let emitBufferChange: () => void = () => {
			throw new Error("buffer listener was not installed");
		};
		let listenerDisposed = false;
		const runtime = {
			container: {} as HTMLDivElement | null,
			terminal: {
				buffer: {
					onBufferChange: (listener: () => void) => {
						emitBufferChange = listener;
						return { dispose: () => (listenerDisposed = true) };
					},
				},
			},
		};
		const entry = {
			runtime,
			disposeBufferChangeListener: null as (() => void) | null,
		};
		const registryInternals = terminalRuntimeRegistry as unknown as {
			observeBufferChanges: (observedEntry: typeof entry) => void;
			pendingEviction: ReturnType<typeof setTimeout> | null;
		};

		if (registryInternals.pendingEviction !== null) {
			clearTimeout(registryInternals.pendingEviction);
			registryInternals.pendingEviction = null;
		}
		registryInternals.observeBufferChanges(entry);
		emitBufferChange();
		expect(registryInternals.pendingEviction).toBeNull();

		runtime.container = null;
		emitBufferChange();
		expect(registryInternals.pendingEviction).not.toBeNull();

		if (registryInternals.pendingEviction !== null) {
			clearTimeout(registryInternals.pendingEviction);
			registryInternals.pendingEviction = null;
		}
		entry.disposeBufferChangeListener?.();
		expect(listenerDisposed).toBe(true);
	});

	test("defers eviction while flushed output is still being parsed", () => {
		const terminalId = "parser-busy-terminal";
		let flushed = false;
		const gate = { pending: 1, queued: null as (() => void) | null };
		const entry = {
			terminalId,
			instanceId: terminalId,
			runtime: {
				container: null,
				gate,
				terminal: { buffer: { active: { type: "normal" } } },
			},
			transport: {
				_writeCoalescer: {
					flushSync: () => {
						flushed = true;
					},
				},
			},
			linkManager: null,
			pendingLinkHandlers: null,
			lastUsedAt: 1,
		};
		const registryInternals = terminalRuntimeRegistry as unknown as {
			entries: Map<string, typeof entry>;
			evictExcessParkedRuntimes: () => void;
		};
		const entryKey = `${terminalId}\u0000${terminalId}`;
		registryInternals.entries.set(entryKey, entry);

		try {
			registryInternals.evictExcessParkedRuntimes();

			expect(flushed).toBe(true);
			expect(gate.queued).not.toBeNull();
			expect(registryInternals.entries.has(entryKey)).toBe(true);
		} finally {
			registryInternals.entries.delete(entryKey);
		}
	});
});
