import { beforeEach, describe, expect, test } from "bun:test";

const mockStorage = new Map<string, string>();
const mockLocalStorage = {
	getItem: (key: string) => mockStorage.get(key) ?? null,
	setItem: (key: string, value: string) => mockStorage.set(key, value),
	removeItem: (key: string) => mockStorage.delete(key),
	clear: () => mockStorage.clear(),
	get length() {
		return mockStorage.size;
	},
	key: (index: number) => Array.from(mockStorage.keys())[index] ?? null,
};

// Zustand's persist middleware reads `window.localStorage`, so wire the mock
// onto both `window` and `globalThis` for safety in this test environment.
// biome-ignore lint/suspicious/noExplicitAny: test mock
const globalAny = globalThis as any;
if (!globalAny.window) globalAny.window = {};
globalAny.window.localStorage = mockLocalStorage;
globalAny.localStorage = mockLocalStorage;

describe("useTasksFilterStore — PR list remembers project (#4329)", () => {
	beforeEach(() => {
		mockStorage.clear();
	});

	test("setProjectFilter persists the selection to localStorage", async () => {
		const { useTasksFilterStore } = await import("./tasks-filter-state");

		useTasksFilterStore.getState().setProjectFilter("project-abc");

		const persistedEntries = Array.from(mockStorage.entries());
		expect(persistedEntries.length).toBeGreaterThan(0);

		const serialized = persistedEntries.map(([, value]) => value).join("");
		expect(serialized).toContain("project-abc");
	});

	test("clearing projectFilter is also persisted", async () => {
		const { useTasksFilterStore } = await import("./tasks-filter-state");

		useTasksFilterStore.getState().setProjectFilter("project-xyz");
		useTasksFilterStore.getState().setProjectFilter(null);

		const serialized = Array.from(mockStorage.values()).join("");
		expect(serialized).not.toContain("project-xyz");
	});
});
