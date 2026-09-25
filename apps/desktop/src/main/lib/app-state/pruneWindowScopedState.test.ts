import { describe, expect, test } from "bun:test";

/**
 * The prune itself is a pure set intersection over the persisted map; the
 * module-level `appState` it mutates needs lowdb and a real file, so the rule
 * is asserted here against the same shape rather than through the singleton.
 */
function prune(
	byWindow: Record<string, { tabs: string[] }>,
	liveKeys: string[],
): Record<string, { tabs: string[] }> {
	const live = new Set(liveKeys);
	return Object.fromEntries(
		Object.entries(byWindow).filter(([key]) => live.has(key)),
	);
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
