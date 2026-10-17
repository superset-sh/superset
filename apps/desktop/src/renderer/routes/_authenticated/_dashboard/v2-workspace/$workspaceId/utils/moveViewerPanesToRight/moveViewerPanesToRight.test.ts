import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../types";
import { moveViewerPanesToRight } from "./moveViewerPanesToRight";

function pane(id: string, kind: string) {
	return { id, kind, data: {} as PaneViewerData };
}

describe("moveViewerPanesToRight", () => {
	it("leaves terminals and chats in the center and gives every other pane a right tab", () => {
		const center = createWorkspaceStore<PaneViewerData>();
		const right = createWorkspaceStore<PaneViewerData>();
		center.getState().addTab({
			id: "c1",
			panes: [pane("term", "terminal"), pane("file", "file")],
		});
		center.getState().addTab({ id: "c2", panes: [pane("chat", "chat-v3")] });
		center.getState().addTab({ id: "c3", panes: [pane("web", "browser")] });

		moveViewerPanesToRight({ center, right });

		expect(
			center
				.getState()
				.tabs.map((tab) => Object.values(tab.panes).map((p) => p.id)),
		).toEqual([["term"], ["chat"]]);
		expect(
			right
				.getState()
				.tabs.map((tab) => Object.values(tab.panes).map((p) => p.id)),
		).toEqual([["file"], ["web"]]);
	});
});
