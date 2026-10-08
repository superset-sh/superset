import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../types";
import { expandPaneArea, restorePaneArea } from "./expandPaneArea";

function pane(id: string) {
	return { id, kind: "browser", data: { url: id } as PaneViewerData };
}

function makeStores() {
	const center = createWorkspaceStore<PaneViewerData>();
	const right = createWorkspaceStore<PaneViewerData>();
	center.getState().addTab({ id: "c1", panes: [pane("p1")] });
	center.getState().addTab({ id: "c2", panes: [pane("p2")] });
	center.getState().setActiveTab("c1");
	right.getState().addTab({ id: "r1", panes: [pane("p3")] });
	return { center, right };
}

describe("expandPaneArea", () => {
	it("puts the center tabs first in the right area and keeps its active tab", () => {
		const { center, right } = makeStores();

		expandPaneArea({ center, right });

		expect(center.getState().tabs).toHaveLength(0);
		expect(right.getState().tabs.map((tab) => tab.id)).toEqual([
			"c1",
			"c2",
			"r1",
		]);
		expect(right.getState().activeTabId).toBe("r1");
	});

	it("returns the moved tabs to the center on restore", () => {
		const { center, right } = makeStores();
		const snapshot = expandPaneArea({ center, right });

		restorePaneArea({ center, right, snapshot });

		expect(center.getState().tabs.map((tab) => tab.id)).toEqual(["c1", "c2"]);
		expect(center.getState().activeTabId).toBe("c1");
		expect(right.getState().tabs.map((tab) => tab.id)).toEqual(["r1"]);
		expect(right.getState().activeTabId).toBe("r1");
	});

	it("leaves a tab opened while expanded in the right area", () => {
		const { center, right } = makeStores();
		const snapshot = expandPaneArea({ center, right });
		right.getState().addTab({ id: "r2", panes: [pane("p4")] });

		restorePaneArea({ center, right, snapshot });

		expect(right.getState().tabs.map((tab) => tab.id)).toEqual(["r1", "r2"]);
	});
});
