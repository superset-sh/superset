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
});
