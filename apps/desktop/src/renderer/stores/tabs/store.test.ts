// biome-ignore-all lint/suspicious/noExplicitAny: Test file uses type casts for test data setup
import { afterEach, describe, expect, mock, test } from "bun:test";

// Mock window.electronStore for persistence layer
const mockStore = new Map<string, string>();
// @ts-expect-error - mocking global window for tests
globalThis.window = {
	electronStore: {
		get: mock((key: string) => Promise.resolve(mockStore.get(key))),
		set: mock((key: string, value: unknown) => {
			mockStore.set(key, value as string);
			return Promise.resolve();
		}),
		delete: mock((key: string) => {
			mockStore.delete(key);
			return Promise.resolve();
		}),
	},
};

// Mock trpc-client to avoid electronTRPC dependency
mock.module("renderer/lib/trpc-client", () => ({
	trpcClient: {
		terminal: {
			kill: { mutate: mock(() => Promise.resolve()) },
		},
	},
}));

// Import after mocks are set up
const { useTabsStore } = await import("./store");
const { TabType } = await import("./types");
type TabGroup = import("./types").TabGroup;

// Store initial state for cleanup
const initialState = useTabsStore.getState();

afterEach(() => {
	// Reset store to initial state between tests
	useTabsStore.setState(initialState, true);
});

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
		const groupTab: TabGroup = {
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

	test("active group uses last-focused child from history", () => {
		const store = useTabsStore.getState();

		const groupTab: TabGroup = {
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
			// child-2 was most recently focused
			tabHistoryStacks: { "workspace-1": ["child-2", "child-1"] },
		});

		// Split with group as active - should use child-2 from history
		store.splitTabVertical("workspace-1");

		const state = useTabsStore.getState();

		// Should have 4 tabs now (group + 3 children)
		expect(state.tabs.length).toBe(4);

		// The group's layout should show child-2 was split
		const updatedGroup = state.tabs.find(
			(t) => t.id === "group-1" && t.type === TabType.Group,
		) as TabGroup;
		expect(updatedGroup).toBeDefined();

		// child-2's position should now be a nested layout
		if (typeof updatedGroup.layout === "string" || !updatedGroup.layout) return;
		expect(updatedGroup.layout.second).toEqual({
			direction: "row",
			first: "child-2",
			second: expect.any(String),
			splitPercentage: 50,
		});
	});

	test("active group falls back to first child when history is empty", () => {
		const store = useTabsStore.getState();

		const groupTab: TabGroup = {
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
			// Empty history
			tabHistoryStacks: { "workspace-1": [] },
		});

		// Split with group as active - should fall back to first child (child-1)
		store.splitTabVertical("workspace-1");

		const state = useTabsStore.getState();

		// Should have 4 tabs now (group + 3 children)
		expect(state.tabs.length).toBe(4);

		// The group's layout should show child-1 was split (first in layout)
		const updatedGroup = state.tabs.find(
			(t) => t.id === "group-1" && t.type === TabType.Group,
		) as TabGroup;
		expect(updatedGroup).toBeDefined();

		// child-1's position should now be a nested layout
		if (typeof updatedGroup.layout === "string" || !updatedGroup.layout) return;
		expect(updatedGroup.layout.first).toEqual({
			direction: "row",
			first: "child-1",
			second: expect.any(String),
			splitPercentage: 50,
		});
	});

	test("active child tab splits within group without explicit path", () => {
		const store = useTabsStore.getState();

		const groupTab: TabGroup = {
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
			// child-1 is the active tab (not the group)
			activeTabIds: { "workspace-1": "child-1" },
			tabHistoryStacks: { "workspace-1": [] },
		});

		// Split with child as active - should split child-1 within the group
		store.splitTabVertical("workspace-1");

		const state = useTabsStore.getState();

		// Should have 4 tabs now (group + 3 children)
		expect(state.tabs.length).toBe(4);

		// The group's layout should show child-1 was split
		const updatedGroup = state.tabs.find(
			(t) => t.id === "group-1" && t.type === TabType.Group,
		) as TabGroup;
		expect(updatedGroup).toBeDefined();

		// child-1's position should now be a nested layout
		if (typeof updatedGroup.layout === "string" || !updatedGroup.layout) return;
		expect(updatedGroup.layout.first).toEqual({
			direction: "row",
			first: "child-1",
			second: expect.any(String),
			splitPercentage: 50,
		});

		// New child should have the group as parent
		const newChild = state.tabs.find(
			(t) =>
				t.type === TabType.Single &&
				t.parentId === "group-1" &&
				t.id !== "child-1" &&
				t.id !== "child-2",
		);
		expect(newChild).toBeDefined();
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

	test("active group uses last-focused child from history", () => {
		const store = useTabsStore.getState();

		const groupTab: TabGroup = {
			id: "group-1",
			title: "Group",
			workspaceId: "workspace-1",
			type: TabType.Group,
			layout: {
				direction: "column" as const,
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
			// child-2 was most recently focused
			tabHistoryStacks: { "workspace-1": ["child-2", "child-1"] },
		});

		// Split with group as active - should use child-2 from history
		store.splitTabHorizontal("workspace-1");

		const state = useTabsStore.getState();

		// Should have 4 tabs now (group + 3 children)
		expect(state.tabs.length).toBe(4);

		// The group's layout should show child-2 was split
		const updatedGroup = state.tabs.find(
			(t) => t.id === "group-1" && t.type === TabType.Group,
		) as TabGroup;
		expect(updatedGroup).toBeDefined();

		// child-2's position should now be a nested layout with column direction
		if (typeof updatedGroup.layout === "string" || !updatedGroup.layout) return;
		expect(updatedGroup.layout.second).toEqual({
			direction: "column",
			first: "child-2",
			second: expect.any(String),
			splitPercentage: 50,
		});
	});

	test("active group falls back to first child when history is empty", () => {
		const store = useTabsStore.getState();

		const groupTab: TabGroup = {
			id: "group-1",
			title: "Group",
			workspaceId: "workspace-1",
			type: TabType.Group,
			layout: {
				direction: "column" as const,
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
			// Empty history
			tabHistoryStacks: { "workspace-1": [] },
		});

		// Split with group as active - should fall back to first child (child-1)
		store.splitTabHorizontal("workspace-1");

		const state = useTabsStore.getState();

		// Should have 4 tabs now (group + 3 children)
		expect(state.tabs.length).toBe(4);

		// The group's layout should show child-1 was split (first in layout)
		const updatedGroup = state.tabs.find(
			(t) => t.id === "group-1" && t.type === TabType.Group,
		) as TabGroup;
		expect(updatedGroup).toBeDefined();

		// child-1's position should now be a nested layout with column direction
		if (typeof updatedGroup.layout === "string" || !updatedGroup.layout) return;
		expect(updatedGroup.layout.first).toEqual({
			direction: "column",
			first: "child-1",
			second: expect.any(String),
			splitPercentage: 50,
		});
	});

	test("active child tab splits within group without explicit path", () => {
		const store = useTabsStore.getState();

		const groupTab: TabGroup = {
			id: "group-1",
			title: "Group",
			workspaceId: "workspace-1",
			type: TabType.Group,
			layout: {
				direction: "column" as const,
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
			// child-1 is the active tab (not the group)
			activeTabIds: { "workspace-1": "child-1" },
			tabHistoryStacks: { "workspace-1": [] },
		});

		// Split with child as active - should split child-1 within the group
		store.splitTabHorizontal("workspace-1");

		const state = useTabsStore.getState();

		// Should have 4 tabs now (group + 3 children)
		expect(state.tabs.length).toBe(4);

		// The group's layout should show child-1 was split
		const updatedGroup = state.tabs.find(
			(t) => t.id === "group-1" && t.type === TabType.Group,
		) as TabGroup;
		expect(updatedGroup).toBeDefined();

		// child-1's position should now be a nested layout with column direction
		if (typeof updatedGroup.layout === "string" || !updatedGroup.layout) return;
		expect(updatedGroup.layout.first).toEqual({
			direction: "column",
			first: "child-1",
			second: expect.any(String),
			splitPercentage: 50,
		});

		// New child should have the group as parent
		const newChild = state.tabs.find(
			(t) =>
				t.type === TabType.Single &&
				t.parentId === "group-1" &&
				t.id !== "child-1" &&
				t.id !== "child-2",
		);
		expect(newChild).toBeDefined();
	});
});
