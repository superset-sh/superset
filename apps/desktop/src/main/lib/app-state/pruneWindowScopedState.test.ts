import { describe, expect, test } from "bun:test";
import { pruneByWindow } from "./pruneByWindow";

/**
 * `pruneWindowScopedState` itself mutates the module-level `appState`, which
 * needs lowdb and a real file; the rule it applies is this pure function.
 */
function prune(
	byWindow: Record<string, { tabs: string[] }>,
	liveKeys: string[],
): Record<string, { tabs: string[] }> {
	return pruneByWindow(byWindow, new Set(liveKeys)) ?? {};
}

describe("per-window UI state pruning", () => {
	test("keeps state for windows that will be restored", () => {
		const byWindow = { a: { tabs: ["1"] }, b: { tabs: ["2"] } };
		expect(prune(byWindow, ["a", "b"])).toEqual(byWindow);
	});

	test("drops state for a window that is gone", () => {
		const byWindow = { a: { tabs: ["1"] }, b: { tabs: ["2"] } };
		expect(prune(byWindow, ["a"])).toEqual({ a: { tabs: ["1"] } });
	});

	test("closing every window clears the map rather than stranding it", () => {
		expect(prune({ a: { tabs: ["1"] } }, [])).toEqual({});
	});

	test("a key with no state yet is not invented", () => {
		expect(prune({}, ["a", "b"])).toEqual({});
	});
});

describe("pruneByWindow", () => {
	test("returns the same object when nothing is dropped", () => {
		// Identity matters: a fresh object every persist would mark app-state
		// dirty on every window write, for no change.
		const byWindow = { a: { tabs: ["1"] } };
		expect(pruneByWindow(byWindow, new Set(["a"]))).toBe(byWindow);
	});

	test("passes undefined through", () => {
		expect(pruneByWindow(undefined, new Set(["a"]))).toBeUndefined();
	});

	test("prunes router history by the same rule as tab layout", () => {
		const byWindow = {
			a: { entries: ["/"], index: 0 },
			gone: { entries: ["/x"], index: 0 },
		};
		expect(pruneByWindow(byWindow, new Set(["a"]))).toEqual({
			a: { entries: ["/"], index: 0 },
		});
	});
});
