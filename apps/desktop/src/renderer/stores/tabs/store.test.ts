import { describe, expect, test } from "bun:test";
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
		};

		// Manually set the tabs
		useTabsStore.setState({
			tabs: [groupTab, childTab],
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
		};

		const child2 = {
			id: "child-2",
			title: "Child 2",
			workspaceId: "workspace-1",
			type: TabType.Single,
			parentId: "group-1",
		};

		useTabsStore.setState({
			tabs: [groupTab, child1, child2],
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
		};

		useTabsStore.setState({
			tabs: [topLevelTab, groupTab, childTab],
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
		};

		useTabsStore.setState({
			tabs: [otherTab, groupTab, childTab],
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
