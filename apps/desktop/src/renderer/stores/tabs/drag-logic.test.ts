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

		// Verify group layout contains both original IDs
		expect(groupTab?.type).toBe(TabType.Group);
		if (groupTab?.type === TabType.Group) {
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

		// Verify group-1 layout was cleaned - should only contain child-1 now
		const updatedGroup1 = result.tabs.find((t) => t.id === "group-1") as Tab & {
			type: TabType.Group;
		};
		expect(updatedGroup1.layout).toBe("child-1");

		// Verify group-2 layout was updated to include child-2
		const updatedGroup2 = result.tabs.find((t) => t.id === "group-2") as Tab & {
			type: TabType.Group;
		};
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

		expect(updatedGroup.layout).toEqual({
			direction: "row",
			first: "child-1",
			second: "tab-2",
			splitPercentage: 50,
		});
	});

	test("dragging tab from complex nested layout cleans correctly", () => {
		// Group with 3-way split: (A | B) on top, C on bottom
		const group1: Tab = {
			id: "group-1",
			title: "Group 1",
			workspaceId,
			type: TabType.Group,
			layout: {
				direction: "column",
				first: {
					direction: "row",
					first: "child-1",
					second: "child-2",
					splitPercentage: 50,
				},
				second: "child-3",
				splitPercentage: 50,
			},
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

		const child3: Tab = {
			id: "child-3",
			title: "Child 3",
			workspaceId,
			type: TabType.Single,
			parentId: "group-1",
		};

		const group2: Tab = {
			id: "group-2",
			title: "Group 2",
			workspaceId,
			type: TabType.Group,
			layout: "child-4",
		};

		const child4: Tab = {
			id: "child-4",
			title: "Child 4",
			workspaceId,
			type: TabType.Single,
			parentId: "group-2",
		};

		const state = {
			tabs: [group1, child1, child2, child3, group2, child4],
			activeTabIds: { [workspaceId]: "group-1" },
			tabHistoryStacks: { [workspaceId]: [] },
		};

		// Drag child-2 from group-1 to group-2
		const result = handleDragTabToTab("child-2", "group-2", state);

		// Group-1 should collapse the nested structure since child-2 is removed
		const updatedGroup1 = result.tabs.find((t) => t.id === "group-1") as Tab & {
			type: TabType.Group;
		};

		// Should collapse to just the remaining two tabs
		expect(updatedGroup1.layout).toEqual({
			direction: "column",
			first: "child-1",
			second: "child-3",
			splitPercentage: 50,
		});

		// Group-2 should add child-2
		const updatedGroup2 = result.tabs.find((t) => t.id === "group-2") as Tab & {
			type: TabType.Group;
		};
		expect(updatedGroup2.layout).toEqual({
			direction: "row",
			first: "child-4",
			second: "child-2",
			splitPercentage: 50,
		});

		// Verify child-2 parent was updated
		const updatedChild2 = result.tabs.find((t) => t.id === "child-2");
		expect(updatedChild2?.parentId).toBe("group-2");
	});

	test("removing last tab from nested layout returns null", () => {
		const layout: MosaicNode<string> = {
			direction: "column",
			first: {
				direction: "row",
				first: "child-1",
				second: "child-2",
				splitPercentage: 50,
			},
			second: "child-3",
			splitPercentage: 50,
		};

		// Remove all tabs one by one
		let cleaned = cleanLayout(layout, new Set(["child-2", "child-3"]));
		expect(cleaned).toEqual({
			direction: "column",
			first: "child-2",
			second: "child-3",
			splitPercentage: 50,
		});

		cleaned = cleanLayout(layout, new Set(["child-3"]));
		expect(cleaned).toBe("child-3");

		cleaned = cleanLayout(layout, new Set([]));
		expect(cleaned).toBeNull();
	});

	test("layout is cleaned when tab is moved to standalone (no longer has parent)", () => {
		// This simulates dragging a child tab out to become a standalone tab
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

		// Simulate the state AFTER dragging child-2 out
		// In reality, some action would clear child-2's parentId
		const stateAfterDrag: Tab[] = [
			groupTab, // Still has old layout with both child-1 and child-2
			child1, // Still has parent
			{ ...child2, parentId: undefined }, // Parent was cleared
		];

		// Now verify that cleanLayout would remove child-2 from the layout
		// since it's no longer a child
		const childTabIds = stateAfterDrag
			.filter((t) => t.parentId === "group-1")
			.map((t) => t.id);
		const validTabIds = new Set(childTabIds);

		expect(validTabIds.has("child-1")).toBe(true);
		expect(validTabIds.has("child-2")).toBe(false);

		const cleanedLayout = cleanLayout(groupTab.layout, validTabIds);

		// Layout should collapse to just child-1
		expect(cleanedLayout).toBe("child-1");
	});

	test("layout with invalid tab IDs is cleaned before rendering", () => {
		// Simulate a group with a stale layout (contains tabs that no longer exist)
		const layout: MosaicNode<string> = {
			direction: "row",
			first: "valid-tab",
			second: "deleted-tab", // This tab was removed but layout wasn't updated
			splitPercentage: 50,
		};

		// Only valid-tab actually exists
		const validTabIds = new Set(["valid-tab"]);
		const cleaned = cleanLayout(layout, validTabIds);

		// Should collapse to just the valid tab
		expect(cleaned).toBe("valid-tab");
	});

	test("complex layout with multiple invalid tabs is fully cleaned", () => {
		// Layout: ((A | B) / (C | D))
		// But only A and D still exist
		const layout: MosaicNode<string> = {
			direction: "column",
			first: {
				direction: "row",
				first: "tab-a",
				second: "tab-b", // Removed
				splitPercentage: 50,
			},
			second: {
				direction: "row",
				first: "tab-c", // Removed
				second: "tab-d",
				splitPercentage: 50,
			},
			splitPercentage: 50,
		};

		const validTabIds = new Set(["tab-a", "tab-d"]);
		const cleaned = cleanLayout(layout, validTabIds);

		// Should collapse to just A and D
		expect(cleaned).toEqual({
			direction: "column",
			first: "tab-a",
			second: "tab-d",
			splitPercentage: 50,
		});
	});

	test("after dragging tab out, getChildTabIds correctly excludes it", () => {
		// This tests the exact scenario that caused "Tab not found"
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

		// Initial state - both children in group
		const initialTabs = [groupTab, child1, child2];
		const initialChildIds = initialTabs
			.filter((t) => t.parentId === "group-1")
			.map((t) => t.id);

		expect(initialChildIds).toEqual(["child-1", "child-2"]);

		// After dragging child-2 out (parentId cleared)
		const afterDragTabs = [
			groupTab, // Layout still has both children (stale)
			child1,
			{ ...child2, parentId: undefined }, // Parent cleared
		];

		const afterDragChildIds = afterDragTabs
			.filter((t) => t.parentId === "group-1")
			.map((t) => t.id);

		// Only child-1 should be returned
		expect(afterDragChildIds).toEqual(["child-1"]);

		// The layout is stale but cleanLayout should fix it
		const validIds = new Set(afterDragChildIds);
		const cleaned = cleanLayout(groupTab.layout, validIds);

		// Layout should now only contain child-1
		expect(cleaned).toBe("child-1");
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

	test("dragging last child from group to another tab removes the group", () => {
		const groupTab: Tab = {
			id: "group-1",
			title: "Group",
			workspaceId,
			type: TabType.Group,
			layout: "child-1",
		};

		const child1: Tab = {
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
			tabs: [groupTab, child1, singleTab],
			activeTabIds: { [workspaceId]: "group-1" },
			tabHistoryStacks: { [workspaceId]: [] },
		};

		// Drag the only child from group-1 to tab-2
		const result = handleDragTabToTab("child-1", "tab-2", state);

		// The group should be removed
		const groupStillExists = result.tabs.some((t) => t.id === "group-1");
		expect(groupStillExists).toBe(false);

		// Should have 3 tabs: child-1, tab-2, and a new group containing both
		expect(result.tabs.length).toBe(3);

		// Verify child-1 and tab-2 are now in a new group
		const newGroup = result.tabs.find((t) => t.type === TabType.Group);
		expect(newGroup).toBeDefined();
		expect(newGroup?.id).not.toBe("group-1");

		const updatedChild1 = result.tabs.find((t) => t.id === "child-1");
		const updatedTab2 = result.tabs.find((t) => t.id === "tab-2");

		expect(updatedChild1?.parentId).toBe(newGroup?.id);
		expect(updatedTab2?.parentId).toBe(newGroup?.id);
	});

	test("dragging last child from group to another group removes the source group", () => {
		const group1: Tab = {
			id: "group-1",
			title: "Group 1",
			workspaceId,
			type: TabType.Group,
			layout: "child-1",
		};

		const child1: Tab = {
			id: "child-1",
			title: "Child 1",
			workspaceId,
			type: TabType.Single,
			parentId: "group-1",
		};

		const group2: Tab = {
			id: "group-2",
			title: "Group 2",
			workspaceId,
			type: TabType.Group,
			layout: "child-2",
		};

		const child2: Tab = {
			id: "child-2",
			title: "Child 2",
			workspaceId,
			type: TabType.Single,
			parentId: "group-2",
		};

		const state = {
			tabs: [group1, child1, group2, child2],
			activeTabIds: { [workspaceId]: "group-1" },
			tabHistoryStacks: { [workspaceId]: [] },
		};

		// Drag the only child from group-1 to group-2
		const result = handleDragTabToTab("child-1", "group-2", state);

		// group-1 should be removed
		const group1StillExists = result.tabs.some((t) => t.id === "group-1");
		expect(group1StillExists).toBe(false);

		// group-2 should still exist
		const updatedGroup2 = result.tabs.find((t) => t.id === "group-2");
		expect(updatedGroup2).toBeDefined();

		// group-2 should now contain both children
		if (updatedGroup2?.type === TabType.Group) {
			expect(updatedGroup2.layout).toEqual({
				direction: "row",
				first: "child-2",
				second: "child-1",
				splitPercentage: 50,
			});
		}

		// Verify child-1 now has group-2 as parent
		const updatedChild1 = result.tabs.find((t) => t.id === "child-1");
		expect(updatedChild1?.parentId).toBe("group-2");

		// Should have 3 tabs total: group-2, child-1, child-2
		expect(result.tabs.length).toBe(3);
	});

	test("dragging last child from nested layout to another tab removes the group", () => {
		// Group with only one child in a simple layout
		const groupTab: Tab = {
			id: "group-1",
			title: "Group",
			workspaceId,
			type: TabType.Group,
			layout: "child-1",
		};

		const child1: Tab = {
			id: "child-1",
			title: "Child 1",
			workspaceId,
			type: TabType.Single,
			parentId: "group-1",
		};

		const targetTab: Tab = {
			id: "target-tab",
			title: "Target",
			workspaceId,
			type: TabType.Single,
		};

		const state = {
			tabs: [groupTab, child1, targetTab],
			activeTabIds: { [workspaceId]: "group-1" },
			tabHistoryStacks: { [workspaceId]: [] },
		};

		const result = handleDragTabToTab("child-1", "target-tab", state);

		// group-1 should be removed
		expect(result.tabs.some((t) => t.id === "group-1")).toBe(false);

		// Should create a new group with child-1 and target-tab
		const newGroup = result.tabs.find(
			(t) => t.type === TabType.Group && t.id !== "group-1",
		);
		expect(newGroup).toBeDefined();
	});
});
