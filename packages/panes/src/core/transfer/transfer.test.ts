import { describe, expect, it } from "bun:test";
import type { CreatePaneInput } from "../store";
import { createWorkspaceStore } from "../store";
import {
	isPaneInLinkedStore,
	transferAllTabs,
	transferPaneToNewTab,
	transferPaneToSplit,
	transferTabToIndex,
	transferTabToSplit,
} from "./transfer";

interface TestData {
	label: string;
}

function tp(id: string): CreatePaneInput<TestData> {
	return { id, kind: "test", data: { label: id } };
}

function makeStores() {
	const source = createWorkspaceStore<TestData>();
	const target = createWorkspaceStore<TestData>();
	const closed: string[] = [];
	source.getState().subscribePaneClose((panes) => {
		for (const pane of panes) closed.push(pane.id);
	});
	return { source, target, closed };
}

describe("transferPaneToSplit", () => {
	it("moves the pane with its id and data and fires no close listener", () => {
		const { source, target, closed } = makeStores();
		source.getState().addTab({ id: "s1", panes: [tp("a"), tp("b")] });
		target.getState().addTab({ id: "t1", panes: [tp("c")] });

		transferPaneToSplit({
			source,
			target,
			paneId: "a",
			targetPaneId: "c",
			position: "left",
		});

		expect(source.getState().getPane("a")).toBeNull();
		expect(target.getState().getPane("a")?.pane.data).toEqual({ label: "a" });
		expect(target.getState().getPane("a")?.tabId).toBe("t1");
		expect(closed).toEqual([]);
	});

	it("reports a moved pane as live until it leaves every linked store", () => {
		const { source, target } = makeStores();
		source.getState().addTab({ id: "s1", panes: [tp("moved-1"), tp("b")] });
		target.getState().addTab({ id: "t1", panes: [tp("c")] });

		transferPaneToSplit({
			source,
			target,
			paneId: "moved-1",
			targetPaneId: "c",
			position: "right",
		});
		expect(isPaneInLinkedStore("moved-1")).toBe(true);

		target.getState().closePane({ tabId: "t1", paneId: "moved-1" });
		expect(isPaneInLinkedStore("moved-1")).toBe(false);
	});

	it("keeps the pane in the source when the target pane is missing", () => {
		const { source, target } = makeStores();
		source.getState().addTab({ id: "s1", panes: [tp("a")] });

		transferPaneToSplit({
			source,
			target,
			paneId: "a",
			targetPaneId: "missing",
			position: "right",
		});

		expect(source.getState().getPane("a")).not.toBeNull();
	});
});

describe("transferPaneToNewTab", () => {
	it("opens the pane as a new active tab at the index", () => {
		const { source, target } = makeStores();
		source.getState().addTab({ id: "s1", panes: [tp("a")] });
		target.getState().addTab({ id: "t1", panes: [tp("c")] });

		transferPaneToNewTab({ source, target, paneId: "a", toIndex: 0 });

		expect(source.getState().tabs).toHaveLength(0);
		const [first] = target.getState().tabs;
		expect(first?.panes.a).toBeDefined();
		expect(target.getState().activeTabId).toBe(first?.id ?? null);
	});
});

describe("transferTabToSplit", () => {
	it("grafts the whole tab layout next to the target pane", () => {
		const { source, target, closed } = makeStores();
		source.getState().addTab({ id: "s1", panes: [tp("a"), tp("b")] });
		target.getState().addTab({ id: "t1", panes: [tp("c")] });

		transferTabToSplit({
			source,
			target,
			tabId: "s1",
			targetPaneId: "c",
			position: "right",
		});

		expect(source.getState().tabs).toHaveLength(0);
		expect(target.getState().tabs).toHaveLength(1);
		expect(Object.keys(target.getState().tabs[0]?.panes ?? {}).sort()).toEqual([
			"a",
			"b",
			"c",
		]);
		expect(closed).toEqual([]);
	});
});

describe("transferTabToIndex", () => {
	it("leaves the tab in the source when the target already has its id", () => {
		const { source, target } = makeStores();
		source.getState().addTab({ id: "dup", panes: [tp("a")] });
		target.getState().addTab({ id: "dup", panes: [tp("b")] });

		transferTabToIndex({ source, target, tabId: "dup" });

		expect(source.getState().getPane("a")?.tabId).toBe("dup");
		expect(target.getState().getPane("a")).toBeNull();
	});
});

describe("transferAllTabs", () => {
	it("appends every source tab to the target and keeps their layouts", () => {
		const { source, target, closed } = makeStores();
		source.getState().addTab({ id: "s1", panes: [tp("a"), tp("b")] });
		source.getState().addTab({ id: "s2", panes: [tp("d")] });
		target.getState().addTab({ id: "t1", panes: [tp("c")] });
		const s1Layout = source.getState().getTab("s1")?.layout;

		transferAllTabs({ source, target });

		expect(source.getState().tabs).toHaveLength(0);
		expect(target.getState().tabs.map((tab) => tab.id)).toEqual([
			"t1",
			"s1",
			"s2",
		]);
		expect(target.getState().getTab("s1")?.layout).toEqual(s1Layout);
		expect(closed).toEqual([]);
	});
});
