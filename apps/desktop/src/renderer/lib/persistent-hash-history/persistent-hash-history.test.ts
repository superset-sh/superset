import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
} from "bun:test";

// Mock localStorage
const storage = new Map<string, string>();
const mockLocalStorage = {
	getItem: mock((key: string) => storage.get(key) ?? null),
	setItem: mock((key: string, value: string) => storage.set(key, value)),
	removeItem: mock((key: string) => storage.delete(key)),
	clear: mock(() => storage.clear()),
	get length() {
		return storage.size;
	},
	key: mock((_index: number) => null as string | null),
};

// Mock window.history.replaceState
const mockReplaceState = mock(
	(_state: unknown, _unused: string, _url?: string | URL | null) => {},
);

// Set up globals BEFORE importing the module (the singleton runs at import time).
// The originals MUST be restored afterAll: later test files in the same process
// create zustand persist stores that read `window.localStorage` at import time,
// and a leaked bare-mock `window` makes that undefined and crashes their setState.
const originalWindow = (globalThis as { window?: unknown }).window;
const originalLocalStorage = (globalThis as { localStorage?: unknown })
	.localStorage;

Object.defineProperty(globalThis, "localStorage", {
	value: mockLocalStorage,
	writable: true,
	configurable: true,
});

Object.defineProperty(globalThis, "window", {
	value: {
		history: {
			replaceState: mockReplaceState,
			state: null,
		},
		location: {
			pathname: "/",
			search: "",
		},
	},
	writable: true,
	configurable: true,
});

// Now safe to import — the module-level singleton will find window/localStorage
const { createPersistentHashHistory, resolveStorageKey } = await import(
	"./persistent-hash-history"
);
const { LEGACY_WINDOW_KEY } = await import("shared/window-identity");

beforeEach(() => {
	storage.clear();
	mockReplaceState.mockClear();
});

afterEach(() => {
	storage.clear();
});

afterAll(() => {
	Object.defineProperty(globalThis, "window", {
		value: originalWindow,
		writable: true,
		configurable: true,
	});
	Object.defineProperty(globalThis, "localStorage", {
		value: originalLocalStorage,
		writable: true,
		configurable: true,
	});
});

describe("createPersistentHashHistory", () => {
	describe("push", () => {
		it("advances index and adds entries", () => {
			const history = createPersistentHashHistory();
			expect(history.length).toBe(1);

			history.push("/tasks");
			expect(history.length).toBe(2);
			expect(history.location.pathname).toBe("/tasks");

			history.push("/workspace/abc");
			expect(history.length).toBe(3);
			expect(history.location.pathname).toBe("/workspace/abc");
		});

		it("truncates forward history on push", () => {
			const history = createPersistentHashHistory();
			history.push("/a");
			history.push("/b");
			history.push("/c");
			expect(history.length).toBe(4); // "/" + 3 pushes

			// Go back twice
			history.back();
			history.back();
			expect(history.location.pathname).toBe("/a");

			// Push new entry — should truncate /b, /c
			history.push("/d");
			expect(history.length).toBe(3); // "/", "/a", "/d"
			expect(history.location.pathname).toBe("/d");
		});
	});

	describe("back and forward", () => {
		it("navigates back and forward correctly", () => {
			const history = createPersistentHashHistory();
			history.push("/a");
			history.push("/b");

			history.back();
			expect(history.location.pathname).toBe("/a");

			history.back();
			expect(history.location.pathname).toBe("/");

			history.forward();
			expect(history.location.pathname).toBe("/a");

			history.forward();
			expect(history.location.pathname).toBe("/b");
		});

		it("does not go before first entry", () => {
			const history = createPersistentHashHistory();
			history.back();
			history.back();
			expect(history.location.pathname).toBe("/");
		});

		it("does not go past last entry", () => {
			const history = createPersistentHashHistory();
			history.push("/a");
			history.forward();
			history.forward();
			expect(history.location.pathname).toBe("/a");
		});
	});

	describe("go(n)", () => {
		it("jumps forward by n", () => {
			const history = createPersistentHashHistory();
			history.push("/a");
			history.push("/b");
			history.push("/c");

			history.back();
			history.back();
			history.back();
			expect(history.location.pathname).toBe("/");

			history.go(2);
			expect(history.location.pathname).toBe("/b");
		});

		it("jumps backward by negative n", () => {
			const history = createPersistentHashHistory();
			history.push("/a");
			history.push("/b");
			history.push("/c");

			history.go(-2);
			expect(history.location.pathname).toBe("/a");
		});

		it("clamps to bounds", () => {
			const history = createPersistentHashHistory();
			history.push("/a");

			history.go(100);
			expect(history.location.pathname).toBe("/a");

			history.go(-100);
			expect(history.location.pathname).toBe("/");
		});
	});

	describe("replace", () => {
		it("updates current entry in-place", () => {
			const history = createPersistentHashHistory();
			history.push("/a");
			expect(history.location.pathname).toBe("/a");

			history.replace("/b");
			expect(history.location.pathname).toBe("/b");
			expect(history.length).toBe(2); // "/" and "/b"
		});
	});

	describe("canGoBack", () => {
		it("returns false at the start", () => {
			const history = createPersistentHashHistory();
			expect(history.canGoBack()).toBe(false);
		});

		it("returns true after pushing", () => {
			const history = createPersistentHashHistory();
			history.push("/a");
			expect(history.canGoBack()).toBe(true);
		});
	});

	describe("localStorage persistence", () => {
		it("persists entries on push", () => {
			const history = createPersistentHashHistory();
			history.push("/tasks");
			history.push("/workspace/abc");

			const stored = JSON.parse(storage.get("router-history") ?? "{}");
			expect(stored.entries).toEqual(["/", "/tasks", "/workspace/abc"]);
			expect(stored.index).toBe(2);
		});

		it("restores from localStorage on new instance", () => {
			storage.set(
				"router-history",
				JSON.stringify({
					entries: ["/", "/tasks", "/workspace/xyz"],
					index: 1,
				}),
			);

			const history = createPersistentHashHistory();
			expect(history.length).toBe(3);
			expect(history.location.pathname).toBe("/tasks");
		});

		it("falls back to / when localStorage is empty", () => {
			const history = createPersistentHashHistory();
			expect(history.length).toBe(1);
			expect(history.location.pathname).toBe("/");
		});

		it("handles corrupted localStorage gracefully", () => {
			storage.set("router-history", "not-valid-json{{{");
			const history = createPersistentHashHistory();
			expect(history.length).toBe(1);
			expect(history.location.pathname).toBe("/");
		});
	});

	describe("MAX_ENTRIES cap", () => {
		it("caps at 100 entries on persist", () => {
			const history = createPersistentHashHistory();

			for (let i = 1; i <= 110; i++) {
				history.push(`/page/${i}`);
			}

			const stored = JSON.parse(storage.get("router-history") ?? "{}");
			expect(stored.entries.length).toBe(100);
			expect(stored.entries[0]).toBe("/page/11");
			expect(stored.entries[99]).toBe("/page/110");
		});

		it("stores non-negative cappedIndex when current position is in the dropped portion", () => {
			// Build 111 entries (index 0="/", 1-110="/page/N"), then navigate
			// back to index 5. At this point entries.length=111 and index=5.
			// persistState caps to 100 entries, computing:
			//   cappedIndex = 5 - (111 - 100) = -6
			// Without the Math.max(0, ...) fix this would store a negative index.
			const history = createPersistentHashHistory();
			for (let i = 1; i <= 110; i++) {
				history.push(`/page/${i}`);
			}
			// Navigate back to index 5 — go() calls persistState internally
			history.go(-105);

			// Check localStorage immediately after go(), before any push that
			// would truncate entries and sidestep the overflow path.
			const stored = JSON.parse(storage.get("router-history") ?? "{}");
			expect(stored.index).toBeGreaterThanOrEqual(0);
		});
	});

	describe("entry type validation", () => {
		it("falls back to / when entries contain non-string values (object format from old versions)", () => {
			// Simulate localStorage written by a hypothetical older version that stored
			// entries as objects instead of plain strings. If loaded without validation,
			// parseHref would receive an object, throw a TypeError, and crash the app
			// before the React error boundary is set up — resulting in a blank window.
			storage.set(
				"router-history",
				JSON.stringify({
					entries: [
						{ path: "/", state: {} },
						{ path: "/workspace/abc", state: {} },
					],
					index: 1,
				}),
			);

			const history = createPersistentHashHistory();
			expect(history.length).toBe(1);
			expect(history.location.pathname).toBe("/");
		});

		it("falls back to / when entries contain null values", () => {
			storage.set(
				"router-history",
				JSON.stringify({ entries: [null, "/workspace/abc"], index: 1 }),
			);

			const history = createPersistentHashHistory();
			expect(history.length).toBe(1);
			expect(history.location.pathname).toBe("/");
		});

		it("falls back to / when entries contain empty strings", () => {
			storage.set(
				"router-history",
				JSON.stringify({ entries: ["", "/workspace/abc"], index: 1 }),
			);

			const history = createPersistentHashHistory();
			expect(history.length).toBe(1);
			expect(history.location.pathname).toBe("/");
		});

		it("accepts entries that are all valid non-empty strings", () => {
			storage.set(
				"router-history",
				JSON.stringify({
					entries: ["/", "/tasks", "/workspace/abc"],
					index: 2,
				}),
			);

			const history = createPersistentHashHistory();
			expect(history.length).toBe(3);
			expect(history.location.pathname).toBe("/workspace/abc");
		});
	});

	describe("getEntries", () => {
		it("returns snapshot of entries with timestamps", () => {
			const history = createPersistentHashHistory();
			history.push("/a");
			history.push("/b");

			const entries = history.getEntries();
			expect(entries.length).toBe(3);
			expect(entries[0]?.path).toBe("/");
			expect(entries[1]?.path).toBe("/a");
			expect(entries[2]?.path).toBe("/b");
			expect(typeof entries[0]?.timestamp).toBe("number");
		});
	});

	describe("hash sync", () => {
		it("syncs hash on push", () => {
			const history = createPersistentHashHistory();
			mockReplaceState.mockClear();

			history.push("/tasks");
			expect(mockReplaceState).toHaveBeenCalledWith(null, "", "#/tasks");
		});

		it("syncs hash on back/forward", () => {
			const history = createPersistentHashHistory();
			history.push("/tasks");
			mockReplaceState.mockClear();

			history.back();
			expect(mockReplaceState).toHaveBeenCalledWith(null, "", "#/");
		});
	});
	describe("resolveStorageKey", () => {
		/** A storage double independent of the module-level singleton's. */
		function makeStorage(initial: Record<string, string> = {}) {
			const map = new Map(Object.entries(initial));
			return {
				map,
				getItem: (key: string) => map.get(key) ?? null,
				setItem: (key: string, value: string) => {
					map.set(key, value);
				},
				removeItem: (key: string) => {
					map.delete(key);
				},
			};
		}

		it("scopes the key to the window", () => {
			const storage = makeStorage();
			expect(resolveStorageKey("window-a", storage)).toBe(
				"router-history:window-a",
			);
		});

		it("falls back to the bare key when there is no window key", () => {
			const storage = makeStorage();
			expect(resolveStorageKey(undefined, storage)).toBe("router-history");
			expect(resolveStorageKey("", storage)).toBe("router-history");
		});

		it("hands the pre-multi-window record to the legacy window", () => {
			const storage = makeStorage({ "router-history": "legacy-route" });

			const key = resolveStorageKey(LEGACY_WINDOW_KEY, storage);

			expect(key).toBe(`router-history:${LEGACY_WINDOW_KEY}`);
			expect(storage.map.get(key)).toBe("legacy-route");
			// Moved, not copied: leaving it behind would strand a key that nothing
			// reads and the sweep deliberately never collects.
			expect(storage.map.has("router-history")).toBe(false);
		});

		it("never lets an ordinary window claim the legacy record", () => {
			const storage = makeStorage({ "router-history": "legacy-route" });

			const key = resolveStorageKey("window-b", storage);

			expect(key).toBe("router-history:window-b");
			expect(storage.map.get(key)).toBeUndefined();
			// Still there for the legacy window to claim whenever it opens.
			expect(storage.map.get("router-history")).toBe("legacy-route");
		});

		it("does not overwrite a legacy window that already has its own history", () => {
			const storage = makeStorage({
				"router-history": "stale-legacy-route",
				[`router-history:${LEGACY_WINDOW_KEY}`]: "current-route",
			});

			const key = resolveStorageKey(LEGACY_WINDOW_KEY, storage);

			expect(storage.map.get(key)).toBe("current-route");
		});

		it("is a one-time handoff", () => {
			const storage = makeStorage({ "router-history": "legacy-route" });
			const key = resolveStorageKey(LEGACY_WINDOW_KEY, storage);
			storage.setItem(key, "navigated-since");

			// A second launch must not resurrect the old route over the new one.
			expect(resolveStorageKey(LEGACY_WINDOW_KEY, storage)).toBe(key);
			expect(storage.map.get(key)).toBe("navigated-since");
		});

		it("tolerates a profile with no legacy record at all", () => {
			const storage = makeStorage();
			const key = resolveStorageKey(LEGACY_WINDOW_KEY, storage);
			expect(key).toBe(`router-history:${LEGACY_WINDOW_KEY}`);
			expect(storage.map.size).toBe(0);
		});
	});
});
