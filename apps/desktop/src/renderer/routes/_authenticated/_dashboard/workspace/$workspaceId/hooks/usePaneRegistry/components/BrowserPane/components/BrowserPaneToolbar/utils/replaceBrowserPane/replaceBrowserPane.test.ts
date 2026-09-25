import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/types";
import { replaceBrowserPane } from "./replaceBrowserPane";

describe("replaceBrowserPane", () => {
	for (const kind of ["page", "pull-request"] as const) {
		for (const pinned of [false, true]) {
			it(`replaces a ${pinned ? "pinned" : "unpinned"} browser with ${kind} in the same split`, () => {
				const store = createWorkspaceStore<PaneViewerData>();
				store.getState().addTab({
					id: "tab",
					panes: [
						{
							id: "browser",
							kind: "browser",
							data: { url: "https://github.com/o/r/pull/1" },
							pinned,
						},
					],
				});
				store.getState().splitPane({
					tabId: "tab",
					paneId: "browser",
					position: "right",
					newPane: {
						id: "neighbor",
						kind: "page",
						data: { slug: "neighbor" },
					},
				});
				const before = store.getState().tabs[0];
				replaceBrowserPane(store, "tab", "browser", {
					id: "native",
					kind,
					data:
						kind === "page"
							? { slug: "report" }
							: { repoFullName: "superset-sh/superset", number: 1 },
				});
				const after = store.getState().tabs[0];
				expect(store.getState().tabs).toHaveLength(1);
				expect(Object.keys(after.panes).sort()).toEqual(["native", "neighbor"]);
				expect(after.panes.neighbor).toEqual(before.panes.neighbor);
				expect(after.panes.native.pinned).toBe(pinned);
				expect(after.activePaneId).toBe("native");
				expect(JSON.stringify(after.layout)).toBe(
					JSON.stringify(before.layout).replace('"browser"', '"native"'),
				);
			});
		}
	}
	it("ignores a stale browser callback after replacement", () => {
		const store = createWorkspaceStore<PaneViewerData>();
		store.getState().addTab({
			id: "tab",
			panes: [{ id: "native", kind: "page", data: { slug: "keep" } }],
		});
		const before = store.getState();
		replaceBrowserPane(store, "tab", "native", {
			kind: "page",
			data: { slug: "wrong" },
		});
		expect(store.getState()).toBe(before);
	});
});
