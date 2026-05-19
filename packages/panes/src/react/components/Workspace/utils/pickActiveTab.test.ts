import { describe, expect, it } from "bun:test";
import type { Tab } from "../../../../types";
import { pickActiveTab } from "./pickActiveTab";

interface TestData {
	label?: string;
}

function makeTab(id: string): Tab<TestData> {
	return {
		id,
		createdAt: 0,
		activePaneId: null,
		layout: { type: "pane", paneId: `${id}-p1` },
		panes: {},
	};
}

describe("pickActiveTab", () => {
	it("returns null when there are no tabs", () => {
		expect(pickActiveTab([], null)).toBeNull();
		expect(pickActiveTab([], "anything")).toBeNull();
	});

	it("returns the tab matching activeTabId", () => {
		const t1 = makeTab("t1");
		const t2 = makeTab("t2");
		expect(pickActiveTab([t1, t2], "t2")).toBe(t2);
	});

	it("falls back to the first tab when activeTabId is null", () => {
		const t1 = makeTab("t1");
		const t2 = makeTab("t2");
		expect(pickActiveTab([t1, t2], null)).toBe(t1);
	});

	// Reproduces #4299: cmd+r reloads the renderer. The persisted V2 workspace
	// state can be restored with a stale activeTabId — the tab it referenced
	// was closed in a prior session, but the pointer wasn't reset. Without
	// this fallback, the workspace renders its empty state even though tabs
	// exist, which is what the user reported as "the right side won't load
	// after reload".
	it("falls back to the first tab when activeTabId is stale (issue #4299)", () => {
		const t1 = makeTab("t1");
		const t2 = makeTab("t2");
		expect(pickActiveTab([t1, t2], "tab-from-prior-session")).toBe(t1);
	});
});
