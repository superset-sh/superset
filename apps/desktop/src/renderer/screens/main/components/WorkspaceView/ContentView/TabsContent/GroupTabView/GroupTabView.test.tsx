import { describe, expect, test } from "bun:test";
import { cleanLayout, getChildTabIds } from "renderer/stores";
import type { Tab } from "renderer/stores/tabs/types";
import { TabType } from "renderer/stores/tabs/types";

describe("GroupTabView logic", () => {
	test("cleanLayout removes tabs that are no longer children", () => {
		const workspaceId = "workspace-1";

		// Group has layout with two children
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

		// child-2's parentId was cleared (dragged out)
		const child2: Tab = {
			id: "child-2",
			title: "Child 2",
			workspaceId,
			type: TabType.Single,
			parentId: undefined,
		};

		const allTabs = [groupTab, child1, child2];

		// Simulate what GroupTabView does
		const childTabIds = getChildTabIds(allTabs, groupTab.id);
		const validTabIds = new Set(childTabIds);
		const cleanedLayout = cleanLayout(groupTab.layout, validTabIds);

		// Should only include child-1 now
		expect(childTabIds).toEqual(["child-1"]);
		expect(cleanedLayout).toBe("child-1");
	});

	test("cleanLayout handles empty children gracefully", () => {
		const workspaceId = "workspace-1";

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

		// Both children have been removed
		const child1: Tab = {
			id: "child-1",
			title: "Child 1",
			workspaceId,
			type: TabType.Single,
			parentId: undefined,
		};

		const child2: Tab = {
			id: "child-2",
			title: "Child 2",
			workspaceId,
			type: TabType.Single,
			parentId: undefined,
		};

		const allTabs = [groupTab, child1, child2];

		// Simulate what GroupTabView does
		const childTabIds = getChildTabIds(allTabs, groupTab.id);
		const validTabIds = new Set(childTabIds);
		const cleanedLayout = cleanLayout(groupTab.layout, validTabIds);

		// Should have no children and null layout
		expect(childTabIds).toEqual([]);
		expect(cleanedLayout).toBeNull();
	});

	test("getChildTabIds only returns tabs with matching parentId", () => {
		const workspaceId = "workspace-1";

		const group1: Tab = {
			id: "group-1",
			title: "Group 1",
			workspaceId,
			type: TabType.Group,
			layout: null,
		};

		const group2: Tab = {
			id: "group-2",
			title: "Group 2",
			workspaceId,
			type: TabType.Group,
			layout: null,
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
			parentId: "group-2",
		};

		const standalone: Tab = {
			id: "standalone",
			title: "Standalone",
			workspaceId,
			type: TabType.Single,
			parentId: undefined,
		};

		const allTabs = [group1, group2, child1, child2, standalone];

		// Each group should only get its own children
		const group1Children = getChildTabIds(allTabs, "group-1");
		const group2Children = getChildTabIds(allTabs, "group-2");

		expect(group1Children).toEqual(["child-1"]);
		expect(group2Children).toEqual(["child-2"]);
	});

	test("cleanLayout preserves complex nested structure when all tabs are valid", () => {
		const layout = {
			direction: "column" as const,
			first: {
				direction: "row" as const,
				first: "tab-a",
				second: "tab-b",
				splitPercentage: 50,
			},
			second: "tab-c",
			splitPercentage: 60,
		};

		const validTabIds = new Set(["tab-a", "tab-b", "tab-c"]);
		const cleaned = cleanLayout(layout, validTabIds);

		// Should remain unchanged since all tabs are valid
		expect(cleaned).toEqual(layout);
	});
});
