import { beforeEach, describe, expect, it } from "bun:test";
import { useRowlessSidebarTabStore } from "../../state/rowlessSidebarTabStore";
import {
	getWorkspaceSidebarTab,
	setWorkspaceSidebarTab,
} from "./setWorkspaceSidebarTab";

type Collections = Parameters<typeof setWorkspaceSidebarTab>[0];

interface StubRow {
	sidebarState: { activeTab: string };
}

function stubCollections(rows: Record<string, StubRow>): Collections {
	return {
		v2WorkspaceLocalState: {
			get: (id: string) => rows[id],
			update: (id: string, mutate: (draft: StubRow) => void) => {
				const row = rows[id];
				if (row) mutate(row);
			},
		},
	} as unknown as Collections;
}

describe("setWorkspaceSidebarTab", () => {
	beforeEach(() => {
		useRowlessSidebarTabStore.setState({ tabs: {} });
	});

	it("writes the tab onto the workspace's local-state row when one exists", () => {
		const rows = { "ws-1": { sidebarState: { activeTab: "changes" } } };

		setWorkspaceSidebarTab(stubCollections(rows), "ws-1", "files");

		expect(rows["ws-1"].sidebarState.activeTab).toBe("files");
		expect(useRowlessSidebarTabStore.getState().tabs["ws-1"]).toBeUndefined();
	});

	it("falls back to the session store for a workspace without a row", () => {
		// Auto-included local `main` checkouts have no local-state row; the
		// switch must still take effect without synthesizing one.
		const rows: Record<string, StubRow> = {};

		setWorkspaceSidebarTab(stubCollections(rows), "main-ws", "files");

		expect(rows["main-ws"]).toBeUndefined();
		expect(useRowlessSidebarTabStore.getState().tabs["main-ws"]).toBe("files");
	});

	it("reads the row's tab, then the rowless fallback, then the default", () => {
		const collections = stubCollections({
			"ws-1": { sidebarState: { activeTab: "review" } },
		});

		expect(getWorkspaceSidebarTab(collections, "ws-1")).toBe("review");
		expect(getWorkspaceSidebarTab(collections, "main-ws")).toBe("changes");
		setWorkspaceSidebarTab(collections, "main-ws", "files");
		expect(getWorkspaceSidebarTab(collections, "main-ws")).toBe("files");
	});

	it("keeps rowless choices per workspace", () => {
		const collections = stubCollections({});

		setWorkspaceSidebarTab(collections, "a", "files");
		setWorkspaceSidebarTab(collections, "b", "review");

		expect(useRowlessSidebarTabStore.getState().tabs).toEqual({
			a: "files",
			b: "review",
		});
	});
});
