import { describe, expect, test } from "bun:test";
import type { MosaicNode } from "react-mosaic-component";
import { cleanLayout, handleDragTabToTab } from "./drag-logic";
import { type Tab, TabType } from "./types";

describe("cleanLayout", () => {
	test("removes invalid tab IDs from layout", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "tab-1",
			second: "tab-2",
			splitPercentage: 50,
		};

		const validTabIds = new Set(["tab-1"]);
		const result = cleanLayout(layout, validTabIds);

		expect(result).toBe("tab-1");
	});

	test("preserves valid nested layout", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "tab-1",
			second: {
				direction: "column",
				first: "tab-2",
				second: "tab-3",
				splitPercentage: 50,
			},
			splitPercentage: 50,
		};

		const validTabIds = new Set(["tab-1", "tab-2", "tab-3"]);
		const result = cleanLayout(layout, validTabIds);

		expect(result).toEqual(layout);
	});

	test("collapses layout when one branch is invalid", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "tab-invalid",
			second: {
				direction: "column",
				first: "tab-2",
				second: "tab-3",
				splitPercentage: 50,
			},
			splitPercentage: 50,
		};

		const validTabIds = new Set(["tab-2", "tab-3"]);
		const result = cleanLayout(layout, validTabIds);

		expect(result).toEqual({
			direction: "column",
			first: "tab-2",
			second: "tab-3",
			splitPercentage: 50,
		});
	});

	test("returns null when all tabs are invalid", () => {
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "tab-invalid-1",
			second: "tab-invalid-2",
			splitPercentage: 50,
		};

		const validTabIds = new Set(["tab-valid"]);
		const result = cleanLayout(layout, validTabIds);

		expect(result).toBeNull();
	});

	test("handles single tab ID layout", () => {
		const layout: MosaicNode<string> = "tab-1";
		const validTabIds = new Set(["tab-1"]);
		const result = cleanLayout(layout, validTabIds);

		expect(result).toBe("tab-1");
	});

	test("returns null for invalid single tab ID", () => {
		const layout: MosaicNode<string> = "tab-invalid";
		const validTabIds = new Set(["tab-valid"]);
		const result = cleanLayout(layout, validTabIds);

		expect(result).toBeNull();
	});
});

describe("handleDragTabToTab", () => {
	const workspaceId = "workspace-1";

	test("dragging single tab onto itself duplicates the tab", () => {
		const tab1: Tab = {
			id: "tab-1",
			title: "Tab 1",
			workspaceId,
			type: TabType.Single,
		};

		const state = {
			tabs: [tab1],
			activeTabIds: { [workspaceId]: "tab-1" },
			tabHistoryStacks: { [workspaceId]: [] },
		};

		const result = handleDragTabToTab("tab-1", "tab-1", state);

		expect(result.tabs.length).toBe(2);
		expect(result.tabs[0].id).toBe("tab-1");
		expect(result.tabs[1].type).toBe(TabType.Single);
		expect(result.activeTabIds[workspaceId]).not.toBe("tab-1");
	});

	test("dragging child tab onto itself does nothing", () => {
		const groupTab: Tab = {
			id: "group-1",
			title: "Group",
			workspaceId,
			type: TabType.Group,
			layout: "child-1",
			childTabIds: ["child-1"],
		};

		const childTab: Tab = {
			id: "child-1",
			title: "Child",
			workspaceId,
			type: TabType.Single,
			parentId: "group-1",
		};

		const state = {
			tabs: [groupTab, childTab],
			activeTabIds: { [workspaceId]: "group-1" },
			tabHistoryStacks: { [workspaceId]: [] },
		};

		const result = handleDragTabToTab("child-1", "child-1", state);

		expect(result).toEqual(state);
	});

	test("dragging single tab into another single tab creates group with original IDs", () => {
		const tab1: Tab = {
			id: "tab-1",
			title: "Tab 1",
			workspaceId,
			type: TabType.Single,
		};

		const tab2: Tab = {
			id: "tab-2",
			title: "Tab 2",
			workspaceId,
			type: TabType.Single,
		};

		const state = {
			tabs: [tab1, tab2],
			activeTabIds: { [workspaceId]: "tab-1" },
			tabHistoryStacks: { [workspaceId]: [] },
		};

		const result = handleDragTabToTab("tab-2", "tab-1", state);

		// Should have 3 tabs: original tab-1, original tab-2, new group
		expect(result.tabs.length).toBe(3);

		// Find the tabs
		const originalTab1 = result.tabs.find((t) => t.id === "tab-1");
		const originalTab2 = result.tabs.find((t) => t.id === "tab-2");
		const groupTab = result.tabs.find((t) => t.type === TabType.Group);

		// Verify original tab IDs are preserved
		expect(originalTab1).toBeDefined();
		expect(originalTab2).toBeDefined();
		expect(originalTab1?.id).toBe("tab-1");
		expect(originalTab2?.id).toBe("tab-2");

		// Verify they now have a parent
		expect(originalTab1?.parentId).toBe(groupTab?.id);
		expect(originalTab2?.parentId).toBe(groupTab?.id);

		// Verify group contains both original IDs
		expect(groupTab?.type).toBe(TabType.Group);
		if (groupTab?.type === TabType.Group) {
			expect(groupTab.childTabIds).toContain("tab-1");
			expect(groupTab.childTabIds).toContain("tab-2");
			expect(groupTab.layout).toEqual({
				direction: "row",
				first: "tab-1",
				second: "tab-2",
				splitPercentage: 50,
			});
		}
	});

	test("dragging single tab into group adds to group", () => {
		const groupTab: Tab = {
			id: "group-1",
			title: "Group",
			workspaceId,
			type: TabType.Group,
			layout: "child-1",
			childTabIds: ["child-1"],
		};

		const childTab: Tab = {
			id: "child-1",
			title: "Child 1",
			workspaceId,
			type: TabType.Single,
			parentId: "group-1",
		};

		const singleTab: Tab = {
			id: "tab-2",
			title: "Tab 2",
			workspaceId,
			type: TabType.Single,
		};

		const state = {
			tabs: [groupTab, childTab, singleTab],
			activeTabIds: { [workspaceId]: "group-1" },
			tabHistoryStacks: { [workspaceId]: [] },
		};

		const result = handleDragTabToTab("tab-2", "group-1", state);

		// Find the updated group
		const updatedGroup = result.tabs.find((t) => t.id === "group-1") as Tab & {
			type: TabType.Group;
		};

		expect(updatedGroup).toBeDefined();
		expect(updatedGroup.type).toBe(TabType.Group);
		expect(updatedGroup.childTabIds).toContain("child-1");
		expect(updatedGroup.childTabIds).toContain("tab-2");
		expect(updatedGroup.layout).toEqual({
			direction: "row",
			first: "child-1",
			second: "tab-2",
			splitPercentage: 50,
		});

		// Verify tab-2 now has the parent
		const updatedTab2 = result.tabs.find((t) => t.id === "tab-2");
		expect(updatedTab2?.parentId).toBe("group-1");
	});

	test("dragging tab from one group to another updates both groups", () => {
		const group1: Tab = {
			id: "group-1",
			title: "Group 1",
			workspaceId,
			type: TabType.Group,
			layout: {
				direction: "row",
				first: "child-1",
				second: "child-2",
				splitPercentage: 50,
			},
			childTabIds: ["child-1", "child-2"],
		};

		const child1: Tab = {
			id: "child-1",
			title: "Child 1",
			workspaceId,
			type: TabType.Single,
			parentId: "group-1",
		};

		const child2: Tab = {
			id: "child-2",
			title: "Child 2",
			workspaceId,
			type: TabType.Single,
			parentId: "group-1",
		};

		const group2: Tab = {
			id: "group-2",
			title: "Group 2",
			workspaceId,
			type: TabType.Group,
			layout: "child-3",
			childTabIds: ["child-3"],
		};

		const child3: Tab = {
			id: "child-3",
			title: "Child 3",
			workspaceId,
			type: TabType.Single,
			parentId: "group-2",
		};

		const state = {
			tabs: [group1, child1, child2, group2, child3],
			activeTabIds: { [workspaceId]: "group-1" },
			tabHistoryStacks: { [workspaceId]: [] },
		};

		// Drag child-2 from group-1 to group-2
		const result = handleDragTabToTab("child-2", "group-2", state);

		// Verify group-1 no longer has child-2
		const updatedGroup1 = result.tabs.find((t) => t.id === "group-1") as Tab & {
			type: TabType.Group;
		};
		expect(updatedGroup1.childTabIds).not.toContain("child-2");
		expect(updatedGroup1.childTabIds).toContain("child-1");

		// Verify layout was cleaned - should only contain child-1 now
		expect(updatedGroup1.layout).toBe("child-1");

		// Verify group-2 now has child-2
		const updatedGroup2 = result.tabs.find((t) => t.id === "group-2") as Tab & {
			type: TabType.Group;
		};
		expect(updatedGroup2.childTabIds).toContain("child-3");
		expect(updatedGroup2.childTabIds).toContain("child-2");

		// Verify layout was updated to include child-2
		expect(updatedGroup2.layout).toEqual({
			direction: "row",
			first: "child-3",
			second: "child-2",
			splitPercentage: 50,
		});

		// Verify child-2 parent was updated
		const updatedChild2 = result.tabs.find((t) => t.id === "child-2");
		expect(updatedChild2?.parentId).toBe("group-2");
	});

	test("dragging into child tab redirects to parent group", () => {
		const groupTab: Tab = {
			id: "group-1",
			title: "Group",
			workspaceId,
			type: TabType.Group,
			layout: "child-1",
			childTabIds: ["child-1"],
		};

		const childTab: Tab = {
			id: "child-1",
			title: "Child 1",
			workspaceId,
			type: TabType.Single,
			parentId: "group-1",
		};

		const singleTab: Tab = {
			id: "tab-2",
			title: "Tab 2",
			workspaceId,
			type: TabType.Single,
		};

		const state = {
			tabs: [groupTab, childTab, singleTab],
			activeTabIds: { [workspaceId]: "group-1" },
			tabHistoryStacks: { [workspaceId]: [] },
		};

		// Drag tab-2 onto child-1 (should redirect to group-1)
		const result = handleDragTabToTab("tab-2", "child-1", state);

		const updatedGroup = result.tabs.find((t) => t.id === "group-1") as Tab & {
			type: TabType.Group;
		};

		expect(updatedGroup.childTabIds).toContain("child-1");
		expect(updatedGroup.childTabIds).toContain("tab-2");
		expect(updatedGroup.layout).toEqual({
			direction: "row",
			first: "child-1",
			second: "tab-2",
			splitPercentage: 50,
		});
	});

	test("dragging tab already in same group does nothing", () => {
		const groupTab: Tab = {
			id: "group-1",
			title: "Group",
			workspaceId,
			type: TabType.Group,
			layout: {
				direction: "row",
				first: "child-1",
				second: "child-2",
				splitPercentage: 50,
			},
			childTabIds: ["child-1", "child-2"],
		};

		const child1: Tab = {
			id: "child-1",
			title: "Child 1",
			workspaceId,
			type: TabType.Single,
			parentId: "group-1",
		};

		const child2: Tab = {
			id: "child-2",
			title: "Child 2",
			workspaceId,
			type: TabType.Single,
			parentId: "group-1",
		};

		const state = {
			tabs: [groupTab, child1, child2],
			activeTabIds: { [workspaceId]: "group-1" },
			tabHistoryStacks: { [workspaceId]: [] },
		};

		// Drag child-1 onto its own parent group
		const result = handleDragTabToTab("child-1", "group-1", state);

		expect(result).toEqual(state);
	});
});
