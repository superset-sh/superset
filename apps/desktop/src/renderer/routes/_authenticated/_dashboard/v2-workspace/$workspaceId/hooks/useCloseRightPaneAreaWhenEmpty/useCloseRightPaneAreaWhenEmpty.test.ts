import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../types";
import { subscribePaneAreaEmptied } from "./useCloseRightPaneAreaWhenEmpty";

describe("subscribePaneAreaEmptied", () => {
	it("fires once when the last tab closes, not while the area stays empty", () => {
		const store = createWorkspaceStore<PaneViewerData>();
		let emptied = 0;
		subscribePaneAreaEmptied(store, () => emptied++);

		store.getState().setActiveTab("none");
		expect(emptied).toBe(0);

		store.getState().addTab({
			id: "t1",
			panes: [{ kind: "file", data: {} as PaneViewerData }],
		});
		store.getState().removeTab("t1");
		expect(emptied).toBe(1);

		store.getState().setActiveTab("none");
		expect(emptied).toBe(1);
	});
});
