import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { FilePaneData, PaneViewerData } from "../../types";
import { openBesidePane } from "./openBesidePane";

const tree = { id: "tree", kind: "files", data: { kind: "files" } } as const;

function file(filePath: string) {
	return {
		kind: "file",
		data: { filePath, mode: "editor" } as FilePaneData,
	};
}

function makeStore() {
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({ id: "t1", panes: [tree] });
	return store;
}

describe("openBesidePane", () => {
	it("splits a new pane to the left of the anchor", () => {
		const store = makeStore();

		openBesidePane(store, "tree", file("/a.ts"));

		const tab = store.getState().getTab("t1");
		expect(Object.keys(tab?.panes ?? {})).toHaveLength(2);
		expect(tab?.layout).toMatchObject({
			type: "split",
			second: { type: "pane", paneId: "tree" },
		});
	});

	it("reuses the unpinned pane of the same kind in the anchor's tab", () => {
		const store = makeStore();
		openBesidePane(store, "tree", file("/a.ts"));

		openBesidePane(store, "tree", file("/b.ts"));

		const panes = Object.values(store.getState().getTab("t1")?.panes ?? {});
		expect(panes).toHaveLength(2);
		const filePane = panes.find((pane) => pane.kind === "file");
		expect((filePane?.data as FilePaneData).filePath).toBe("/b.ts");
	});

	it("splits again when the existing pane is pinned", () => {
		const store = makeStore();
		openBesidePane(store, "tree", file("/a.ts"));
		const first = Object.values(
			store.getState().getTab("t1")?.panes ?? {},
		).find((pane) => pane.kind === "file");
		store.getState().setPanePinned({ paneId: first?.id ?? "", pinned: true });

		openBesidePane(store, "tree", file("/b.ts"));

		expect(
			Object.keys(store.getState().getTab("t1")?.panes ?? {}),
		).toHaveLength(3);
	});

	it("opens a new tab when asked", () => {
		const store = makeStore();

		openBesidePane(store, "tree", file("/a.ts"), true);

		expect(store.getState().tabs).toHaveLength(2);
	});
});
