import { describe, expect, it } from "bun:test";
import type { TabsState } from "../types";
import { TabType } from "../types";
import { findNextTab } from "./next-tab-finder";

describe("findNextTab", () => {
	it("should return next tab by index when closing a middle tab", () => {
		const state: TabsState = {
			tabs: [
				{
					id: "tab1",
					title: "Tab 1",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
				{
					id: "tab2",
					title: "Tab 2",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
				{
					id: "tab3",
					title: "Tab 3",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
			],
			activeTabIds: { workspace1: "tab2" },
			tabHistoryStacks: { workspace1: [] },
		};

		const nextTabId = findNextTab(state, "tab2");
		expect(nextTabId).toBe("tab3"); // Should select the next tab (right side)
	});

	it("should return previous tab by index when closing the last tab", () => {
		const state: TabsState = {
			tabs: [
				{
					id: "tab1",
					title: "Tab 1",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
				{
					id: "tab2",
					title: "Tab 2",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
				{
					id: "tab3",
					title: "Tab 3",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
			],
			activeTabIds: { workspace1: "tab3" },
			tabHistoryStacks: { workspace1: [] },
		};

		const nextTabId = findNextTab(state, "tab3");
		expect(nextTabId).toBe("tab2"); // Should select the previous tab (left side)
	});

	it("should return null when closing the only tab", () => {
		const state: TabsState = {
			tabs: [
				{
					id: "tab1",
					title: "Tab 1",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
			],
			activeTabIds: { workspace1: "tab1" },
			tabHistoryStacks: { workspace1: [] },
		};

		const nextTabId = findNextTab(state, "tab1");
		expect(nextTabId).toBeNull();
	});

	it("should find next tab within the same group when closing a child tab", () => {
		const state: TabsState = {
			tabs: [
				{
					id: "group1",
					title: "Group 1",
					workspaceId: "workspace1",
					type: TabType.Group,
					layout: {
						direction: "row",
						first: "child1",
						second: "child2",
					},
				},
				{
					id: "child1",
					title: "Child 1",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group1",
				},
				{
					id: "child2",
					title: "Child 2",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group1",
				},
				{
					id: "child3",
					title: "Child 3",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group1",
				},
			],
			activeTabIds: { workspace1: "child2" },
			tabHistoryStacks: { workspace1: [] },
		};

		const nextTabId = findNextTab(state, "child2");
		expect(nextTabId).toBe("child3"); // Should prefer next tab in the same group
	});

	it("should find previous tab within the same group when closing the last child", () => {
		const state: TabsState = {
			tabs: [
				{
					id: "group1",
					title: "Group 1",
					workspaceId: "workspace1",
					type: TabType.Group,
					layout: {
						direction: "row",
						first: "child1",
						second: "child2",
					},
				},
				{
					id: "child1",
					title: "Child 1",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group1",
				},
				{
					id: "child2",
					title: "Child 2",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group1",
				},
			],
			activeTabIds: { workspace1: "child2" },
			tabHistoryStacks: { workspace1: [] },
		};

		const nextTabId = findNextTab(state, "child2");
		expect(nextTabId).toBe("child1"); // Should select previous tab in the same group
	});

	it("should ignore tabs from other workspaces", () => {
		const state: TabsState = {
			tabs: [
				{
					id: "tab1",
					title: "Tab 1",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
				{
					id: "tab2",
					title: "Tab 2",
					workspaceId: "workspace2",
					type: TabType.Single,
				},
			],
			activeTabIds: { workspace1: "tab1" },
			tabHistoryStacks: { workspace1: [] },
		};

		const nextTabId = findNextTab(state, "tab1");
		expect(nextTabId).toBeNull(); // Should not select tab from different workspace
	});

	it("should always find a tab if any exist in workspace (ultimate fallback)", () => {
		const state: TabsState = {
			tabs: [
				{
					id: "group1",
					title: "Group 1",
					workspaceId: "workspace1",
					type: TabType.Group,
					layout: {
						direction: "row",
						first: "child1",
						second: "child2",
					},
				},
				{
					id: "child1",
					title: "Child 1",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group1",
				},
				{
					id: "child2",
					title: "Child 2",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group1",
				},
				{
					id: "group2",
					title: "Group 2",
					workspaceId: "workspace1",
					type: TabType.Group,
					layout: "child3",
				},
				{
					id: "child3",
					title: "Child 3",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group2",
				},
			],
			activeTabIds: { workspace1: "child1" },
			tabHistoryStacks: { workspace1: [] },
		};

		// Closing child1 when there are only groups and child tabs
		// Should fallback to group1 (top-level) or another child tab
		const nextTabId = findNextTab(state, "child1");
		expect(nextTabId).not.toBeNull(); // Should never be null when tabs exist
		if (nextTabId) {
			expect(["child2", "child3", "group1", "group2"]).toContain(nextTabId);
		}
	});

	it("should prefer history stack over positional fallback", () => {
		const state: TabsState = {
			tabs: [
				{
					id: "tab1",
					title: "Tab 1",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
				{
					id: "tab2",
					title: "Tab 2",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
				{
					id: "tab3",
					title: "Tab 3",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
			],
			activeTabIds: { workspace1: "tab2" },
			tabHistoryStacks: { workspace1: ["tab1", "tab3"] }, // tab1 was most recently active
		};

		const nextTabId = findNextTab(state, "tab2");
		expect(nextTabId).toBe("tab1"); // Should prefer history over position
	});

	it("should fall back to next tab when history is empty", () => {
		const state: TabsState = {
			tabs: [
				{
					id: "tab1",
					title: "Tab 1",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
				{
					id: "tab2",
					title: "Tab 2",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
				{
					id: "tab3",
					title: "Tab 3",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
			],
			activeTabIds: { workspace1: "tab1" },
			tabHistoryStacks: { workspace1: [] },
		};

		const nextTabId = findNextTab(state, "tab1");
		expect(nextTabId).toBe("tab2"); // Should select next positional tab
	});

	it("should fall back to any available tab when closing a tab not in current position", () => {
		const state: TabsState = {
			tabs: [
				{
					id: "tab1",
					title: "Tab 1",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
				{
					id: "group1",
					title: "Group 1",
					workspaceId: "workspace1",
					type: TabType.Group,
					layout: "child1",
				},
				{
					id: "child1",
					title: "Child 1",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group1",
				},
			],
			activeTabIds: { workspace1: "child1" },
			tabHistoryStacks: { workspace1: [] },
		};

		const nextTabId = findNextTab(state, "child1");
		expect(nextTabId).not.toBeNull();
		// Should fall back to group1 or tab1
		if (nextTabId) {
			expect(["tab1", "group1"]).toContain(nextTabId);
		}
	});

	it("should handle closing only child in a group with other top-level tabs", () => {
		const state: TabsState = {
			tabs: [
				{
					id: "tab1",
					title: "Tab 1",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
				{
					id: "group1",
					title: "Group 1",
					workspaceId: "workspace1",
					type: TabType.Group,
					layout: "child1",
				},
				{
					id: "child1",
					title: "Child 1",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group1",
				},
				{
					id: "tab2",
					title: "Tab 2",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
			],
			activeTabIds: { workspace1: "child1" },
			tabHistoryStacks: { workspace1: [] },
		};

		const nextTabId = findNextTab(state, "child1");
		expect(nextTabId).not.toBeNull();
		// Should return tab2 (next after parent group) or tab1
		if (nextTabId) {
			expect(["tab1", "tab2", "group1"]).toContain(nextTabId);
		}
	});

	it("should always return a tab when multiple tabs exist in workspace", () => {
		const state: TabsState = {
			tabs: [
				{
					id: "tab1",
					title: "Tab 1",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
				{
					id: "tab2",
					title: "Tab 2",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
				{
					id: "tab3",
					title: "Tab 3",
					workspaceId: "workspace2",
					type: TabType.Single,
				},
			],
			activeTabIds: { workspace1: "tab1", workspace2: "tab3" },
			tabHistoryStacks: { workspace1: [], workspace2: [] },
		};

		const nextTabId = findNextTab(state, "tab1");
		expect(nextTabId).toBe("tab2");
	});

	it("should handle mixed top-level and grouped tabs correctly", () => {
		const state: TabsState = {
			tabs: [
				{
					id: "tab1",
					title: "Tab 1",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
				{
					id: "group1",
					title: "Group 1",
					workspaceId: "workspace1",
					type: TabType.Group,
					layout: {
						direction: "row",
						first: "child1",
						second: "child2",
					},
				},
				{
					id: "child1",
					title: "Child 1",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group1",
				},
				{
					id: "child2",
					title: "Child 2",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group1",
				},
				{
					id: "tab2",
					title: "Tab 2",
					workspaceId: "workspace1",
					type: TabType.Single,
				},
			],
			activeTabIds: { workspace1: "tab1" },
			tabHistoryStacks: { workspace1: [] },
		};

		const nextTabId = findNextTab(state, "tab1");
		expect(nextTabId).toBe("group1"); // Should select next top-level tab
	});

	it("should select next sibling when closing a child in a group with multiple children", () => {
		const state: TabsState = {
			tabs: [
				{
					id: "group1",
					title: "Group 1",
					workspaceId: "workspace1",
					type: TabType.Group,
					layout: {
						direction: "row",
						first: "child1",
						second: {
							direction: "column",
							first: "child2",
							second: "child3",
						},
					},
				},
				{
					id: "child1",
					title: "Child 1",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group1",
				},
				{
					id: "child2",
					title: "Child 2",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group1",
				},
				{
					id: "child3",
					title: "Child 3",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group1",
				},
			],
			activeTabIds: { workspace1: "child1" },
			tabHistoryStacks: { workspace1: [] },
		};

		const nextTabId = findNextTab(state, "child1");
		expect(nextTabId).toBe("child2"); // Should select next sibling in group
	});

	it("should select previous sibling when closing the last child in a group", () => {
		const state: TabsState = {
			tabs: [
				{
					id: "group1",
					title: "Group 1",
					workspaceId: "workspace1",
					type: TabType.Group,
					layout: {
						direction: "row",
						first: "child1",
						second: "child2",
					},
				},
				{
					id: "child1",
					title: "Child 1",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group1",
				},
				{
					id: "child2",
					title: "Child 2",
					workspaceId: "workspace1",
					type: TabType.Single,
					parentId: "group1",
				},
			],
			activeTabIds: { workspace1: "child2" },
			tabHistoryStacks: { workspace1: [] },
		};

		const nextTabId = findNextTab(state, "child2");
		expect(nextTabId).toBe("child1"); // Should select previous sibling in group
	});
});
