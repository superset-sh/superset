import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

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

// Set up globals BEFORE importing the module (the singleton runs at import time)
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
const { createPersistentHashHistory } = await import(
	"./persistent-hash-history"
);

beforeEach(() => {
	storage.clear();
	mockReplaceState.mockClear();
});

afterEach(() => {
	storage.clear();
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
});
