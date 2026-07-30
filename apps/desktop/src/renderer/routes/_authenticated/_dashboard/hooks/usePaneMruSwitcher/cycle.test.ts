import { describe, expect, it } from "bun:test";
import type { PaneMruEntry } from "renderer/stores/pane-mru";
import { advanceCycle, isCycleModifier, selectedEntry } from "./cycle";

function makeEntries(count: number): PaneMruEntry[] {
	return Array.from({ length: count }, (_, index) => ({
		workspaceId: "ws-1",
		tabId: "tab-1",
		paneId: `pane-${index}`,
		kind: "chat",
		label: `Pane ${index}`,
		tabLabel: "Tab 1",
		workspaceName: "Workspace 1",
		lastFocusedAt: count - index,
	}));
}

describe("advanceCycle", () => {
	it("starts a backward cycle on the previously used pane, not the current one", () => {
		// This is what makes a single Ctrl+Tab tap toggle between the two most
		// recent panes instead of doing nothing.
		const cycle = advanceCycle({
			cycle: null,
			entries: makeEntries(3),
			direction: "backward",
		});

		expect(cycle?.selectedIndex).toBe(1);
	});

	it("starts a forward cycle on the oldest pane", () => {
		const cycle = advanceCycle({
			cycle: null,
			entries: makeEntries(3),
			direction: "forward",
		});

		expect(cycle?.selectedIndex).toBe(2);
	});

	it("refuses to start with fewer than two panes", () => {
		expect(
			advanceCycle({
				cycle: null,
				entries: makeEntries(1),
				direction: "backward",
			}),
		).toBeNull();
		expect(
			advanceCycle({ cycle: null, entries: [], direction: "backward" }),
		).toBeNull();
	});

	it("steps backward through the snapshot", () => {
		const entries = makeEntries(4);
		let cycle = advanceCycle({ cycle: null, entries, direction: "backward" });
		cycle = advanceCycle({ cycle, entries, direction: "backward" });

		expect(cycle?.selectedIndex).toBe(2);
	});

	it("wraps around both ends", () => {
		const entries = makeEntries(3);
		let cycle = advanceCycle({ cycle: null, entries, direction: "backward" });
		cycle = advanceCycle({ cycle, entries, direction: "backward" });
		cycle = advanceCycle({ cycle, entries, direction: "backward" });

		// 1 -> 2 -> 0
		expect(cycle?.selectedIndex).toBe(0);

		cycle = advanceCycle({ cycle, entries, direction: "forward" });
		expect(cycle?.selectedIndex).toBe(2);
	});

	it("keeps using the snapshot even when the live list changes mid-cycle", () => {
		// The overlay must not reorder under the highlight while Ctrl is held.
		const entries = makeEntries(3);
		const started = advanceCycle({
			cycle: null,
			entries,
			direction: "backward",
		});

		const advanced = advanceCycle({
			cycle: started,
			entries: makeEntries(9),
			direction: "backward",
		});

		expect(advanced?.entries).toBe(entries);
		expect(advanced?.entries).toHaveLength(3);
	});
});

describe("advanceCycle with exactly two panes", () => {
	// The tap-to-toggle case the feature exists for.
	const entries = makeEntries(2);

	it("selects the other pane on the first backward tap", () => {
		const cycle = advanceCycle({ cycle: null, entries, direction: "backward" });
		expect(cycle?.selectedIndex).toBe(1);
	});

	it("selects the other pane on the first forward tap", () => {
		const cycle = advanceCycle({ cycle: null, entries, direction: "forward" });
		expect(cycle?.selectedIndex).toBe(1);
	});

	it("alternates between the two on repeated taps", () => {
		let cycle = advanceCycle({ cycle: null, entries, direction: "backward" });
		cycle = advanceCycle({ cycle, entries, direction: "backward" });
		expect(cycle?.selectedIndex).toBe(0);

		cycle = advanceCycle({ cycle, entries, direction: "backward" });
		expect(cycle?.selectedIndex).toBe(1);
	});
});

describe("advanceCycle stepping forward repeatedly", () => {
	it("walks forward on consecutive forward steps", () => {
		// Ctrl+` can be the direction for several steps in a row.
		const entries = makeEntries(4);
		let cycle = advanceCycle({ cycle: null, entries, direction: "forward" });
		cycle = advanceCycle({ cycle, entries, direction: "forward" });

		expect(cycle?.selectedIndex).toBe(2);
	});
});

describe("isCycleModifier", () => {
	it("commits on the modifiers a binding can use", () => {
		expect(isCycleModifier("Control")).toBe(true);
		expect(isCycleModifier("Alt")).toBe(true);
		expect(isCycleModifier("Meta")).toBe(true);
	});

	it("does not commit on Shift", () => {
		// Ctrl+Shift+Tab releases Shift while still cycling; treating that as a
		// commit would end the cycle a step early.
		expect(isCycleModifier("Shift")).toBe(false);
	});

	it("does not commit on ordinary keys", () => {
		expect(isCycleModifier("Tab")).toBe(false);
		expect(isCycleModifier("a")).toBe(false);
	});
});

describe("selectedEntry", () => {
	it("returns the highlighted entry", () => {
		const entries = makeEntries(3);
		const cycle = advanceCycle({ cycle: null, entries, direction: "backward" });

		expect(cycle && selectedEntry(cycle)?.paneId).toBe("pane-1");
	});

	it("returns undefined when the index has no entry", () => {
		// The caller guards on this before filing a focus request.
		expect(selectedEntry({ entries: [], selectedIndex: 0 })).toBeUndefined();
	});
});
