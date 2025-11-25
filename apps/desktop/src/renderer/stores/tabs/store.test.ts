import { describe, expect, mock, test } from "bun:test";

// Mock the terminal cleanup to avoid actually calling tRPC
mock.module("./utils/terminal-cleanup", () => ({
	killTerminalForTab: mock(() => {}),
}));

import { useTabsStore } from "./store";
import { TabType } from "./types";

describe("removeTab", () => {
	test("removing last child from group removes the group", () => {
		const store = useTabsStore.getState();

		// Create a group with one child
		const groupTab = {
			id: "group-1",
			title: "Group",
			workspaceId: "workspace-1",
			type: TabType.Group,
			layout: "child-1" as const,
		};

		const childTab = {
			id: "child-1",
			title: "Child",
			workspaceId: "workspace-1",
			type: TabType.Single,
			parentId: "group-1",
		} as const;

		// Manually set the tabs
		useTabsStore.setState({
			tabs: [groupTab, childTab as any],
			activeTabIds: { "workspace-1": "group-1" },
			tabHistoryStacks: { "workspace-1": [] },
		});

		// Remove the child tab
		store.removeTab("child-1");

		// Both the child and group should be removed
		const state = useTabsStore.getState();
		expect(state.tabs.some((t) => t.id === "child-1")).toBe(false);
		expect(state.tabs.some((t) => t.id === "group-1")).toBe(false);
	});

	test("removing one child from group with multiple children keeps the group", () => {
		const store = useTabsStore.getState();

		// Create a group with two children
		const groupTab = {
			id: "group-1",
			title: "Group",
			workspaceId: "workspace-1",
			type: TabType.Group,
			layout: {
				direction: "row" as const,
				first: "child-1",
				second: "child-2",
				splitPercentage: 50,
			},
		};

		const child1 = {
			id: "child-1",
			title: "Child 1",
			workspaceId: "workspace-1",
			type: TabType.Single,
			parentId: "group-1",
		} as const;

		const child2 = {
			id: "child-2",
			title: "Child 2",
			workspaceId: "workspace-1",
			type: TabType.Single,
			parentId: "group-1",
		} as const;

		useTabsStore.setState({
			tabs: [groupTab, child1 as any, child2 as any],
			activeTabIds: { "workspace-1": "group-1" },
			tabHistoryStacks: { "workspace-1": [] },
		});

		// Remove one child tab
		store.removeTab("child-1");

		// child-1 should be removed, but group and child-2 should remain
		const state = useTabsStore.getState();
		expect(state.tabs.some((t) => t.id === "child-1")).toBe(false);
		expect(state.tabs.some((t) => t.id === "group-1")).toBe(true);
		expect(state.tabs.some((t) => t.id === "child-2")).toBe(true);

		// Group layout should be cleaned to only contain child-2
		const updatedGroup = state.tabs.find((t) => t.id === "group-1");
		if (updatedGroup && updatedGroup.type === TabType.Group) {
			expect(updatedGroup.layout).toBe("child-2");
		}
	});

	test("removing top-level tab does not affect groups", () => {
		const store = useTabsStore.getState();

		const topLevelTab = {
			id: "top-1",
			title: "Top Level",
			workspaceId: "workspace-1",
			type: TabType.Single,
		};

		const groupTab = {
			id: "group-1",
			title: "Group",
			workspaceId: "workspace-1",
			type: TabType.Group,
			layout: "child-1" as const,
		};

		const childTab = {
			id: "child-1",
			title: "Child",
			workspaceId: "workspace-1",
			type: TabType.Single,
			parentId: "group-1",
		} as const;

		useTabsStore.setState({
			tabs: [topLevelTab, groupTab, childTab as any],
			activeTabIds: { "workspace-1": "top-1" },
			tabHistoryStacks: { "workspace-1": [] },
		});

		// Remove the top-level tab
		store.removeTab("top-1");

		// Only top-level tab should be removed
		const state = useTabsStore.getState();
		expect(state.tabs.some((t) => t.id === "top-1")).toBe(false);
		expect(state.tabs.some((t) => t.id === "group-1")).toBe(true);
		expect(state.tabs.some((t) => t.id === "child-1")).toBe(true);
	});

	test("removing last child updates active tab correctly", () => {
		const store = useTabsStore.getState();

		const otherTab = {
			id: "other-1",
			title: "Other",
			workspaceId: "workspace-1",
			type: TabType.Single,
		};

		const groupTab = {
			id: "group-1",
			title: "Group",
			workspaceId: "workspace-1",
			type: TabType.Group,
			layout: "child-1" as const,
		};

		const childTab = {
			id: "child-1",
			title: "Child",
			workspaceId: "workspace-1",
			type: TabType.Single,
			parentId: "group-1",
		} as const;

		useTabsStore.setState({
			tabs: [otherTab, groupTab, childTab as any],
			activeTabIds: { "workspace-1": "group-1" },
			tabHistoryStacks: { "workspace-1": [] },
		});

		// Remove the child tab (which will also remove the group)
		store.removeTab("child-1");

		// Active tab should switch to the other tab
		const state = useTabsStore.getState();
		expect(state.activeTabIds["workspace-1"]).toBe("other-1");
	});
});

describe("splitTabVertical", () => {
	test("splits active tab vertically creating a group with two children", () => {
		const store = useTabsStore.getState();

		const singleTab = {
			id: "tab-1",
			title: "Original Tab",
			workspaceId: "workspace-1",
			type: TabType.Single,
		} as const;

		useTabsStore.setState({
			tabs: [singleTab],
			activeTabIds: { "workspace-1": "tab-1" },
			tabHistoryStacks: { "workspace-1": [] },
		});

		// Split the tab vertically
		store.splitTabVertical("workspace-1");

		const state = useTabsStore.getState();

		// Should have 3 tabs: original (now child), new child, and group
		expect(state.tabs.length).toBe(3);

		// Find the group tab
		const groupTab = state.tabs.find((t) => t.type === TabType.Group);
		expect(groupTab).toBeDefined();
		if (groupTab?.type !== TabType.Group) return;

		expect(groupTab.layout).toEqual({
			direction: "row",
			first: "tab-1",
			second: expect.any(String),
			splitPercentage: 50,
		});

		// Original tab should now be a child
		const originalTab = state.tabs.find((t) => t.id === "tab-1");
		expect(originalTab?.parentId).toBe(groupTab.id);

		// New child should exist
		if (typeof groupTab.layout === "string" || !groupTab.layout) return;
		const newChild = state.tabs.find(
			(t) =>
				typeof groupTab.layout !== "string" &&
				groupTab.layout &&
				"second" in groupTab.layout &&
				t.id === groupTab.layout.second &&
				t.type === TabType.Single,
		);
		expect(newChild).toBeDefined();
		expect(newChild?.parentId).toBe(groupTab.id);

		// Active tab should be the group
		expect(state.activeTabIds["workspace-1"]).toBe(groupTab.id);
	});

	test("does not split a group tab", () => {
		const store = useTabsStore.getState();

		const groupTab = {
			id: "group-1",
			title: "Group",
			workspaceId: "workspace-1",
			type: TabType.Group,
			layout: {
				direction: "row" as const,
				first: "child-1",
				second: "child-2",
				splitPercentage: 50,
			},
		};

		useTabsStore.setState({
			tabs: [groupTab],
			activeTabIds: { "workspace-1": "group-1" },
			tabHistoryStacks: { "workspace-1": [] },
		});

		// Try to split the group
		store.splitTabVertical("workspace-1");

		const state = useTabsStore.getState();

		// Should remain unchanged
		expect(state.tabs.length).toBe(1);
		expect(state.tabs[0].id).toBe("group-1");
	});
});

describe("splitTabHorizontal", () => {
	test("splits active tab horizontally creating a group with two children", () => {
		const store = useTabsStore.getState();

		const singleTab = {
			id: "tab-1",
			title: "Original Tab",
			workspaceId: "workspace-1",
			type: TabType.Single,
		} as const;

		useTabsStore.setState({
			tabs: [singleTab],
			activeTabIds: { "workspace-1": "tab-1" },
			tabHistoryStacks: { "workspace-1": [] },
		});

		// Split the tab horizontally
		store.splitTabHorizontal("workspace-1");

		const state = useTabsStore.getState();

		// Should have 3 tabs: original (now child), new child, and group
		expect(state.tabs.length).toBe(3);

		// Find the group tab
		const groupTab = state.tabs.find((t) => t.type === TabType.Group);
		expect(groupTab).toBeDefined();
		if (groupTab?.type !== TabType.Group) return;

		expect(groupTab.layout).toEqual({
			direction: "column",
			first: "tab-1",
			second: expect.any(String),
			splitPercentage: 50,
		});

		// Original tab should now be a child
		const originalTab = state.tabs.find((t) => t.id === "tab-1");
		expect(originalTab?.parentId).toBe(groupTab.id);

		// New child should exist
		if (typeof groupTab.layout === "string" || !groupTab.layout) return;
		const newChild = state.tabs.find(
			(t) =>
				typeof groupTab.layout !== "string" &&
				groupTab.layout &&
				"second" in groupTab.layout &&
				t.id === groupTab.layout.second &&
				t.type === TabType.Single,
		);
		expect(newChild).toBeDefined();
		expect(newChild?.parentId).toBe(groupTab.id);

		// Active tab should be the group
		expect(state.activeTabIds["workspace-1"]).toBe(groupTab.id);
	});

	test("splits specific tab by id", () => {
		const store = useTabsStore.getState();

		const tab1 = {
			id: "tab-1",
			title: "Tab 1",
			workspaceId: "workspace-1",
			type: TabType.Single,
		} as const;

		const tab2 = {
			id: "tab-2",
			title: "Tab 2",
			workspaceId: "workspace-1",
			type: TabType.Single,
		} as const;

		useTabsStore.setState({
			tabs: [tab1, tab2],
			activeTabIds: { "workspace-1": "tab-1" },
			tabHistoryStacks: { "workspace-1": [] },
		});

		// Split tab-2 specifically (not the active tab)
		store.splitTabHorizontal("workspace-1", "tab-2");

		const state = useTabsStore.getState();

		// Should have 4 tabs: tab-1, tab-2 (now child), new child, and group
		expect(state.tabs.length).toBe(4);

		// Find the group tab
		const groupTab = state.tabs.find((t) => t.type === TabType.Group);
		expect(groupTab).toBeDefined();

		// Tab-2 should be in the group
		const tab2After = state.tabs.find((t) => t.id === "tab-2");
		expect(tab2After?.parentId).toBe(groupTab?.id);

		// Tab-1 should remain unchanged
		const tab1After = state.tabs.find((t) => t.id === "tab-1");
		expect(tab1After?.parentId).toBeUndefined();
	});
});
