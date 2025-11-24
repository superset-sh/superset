import { describe, expect, it } from "bun:test";
import type { TabsState } from "../types";
import { TabType } from "../types";
import { handleRemoveChildTabFromGroup } from "./group-operations";

describe("handleRemoveChildTabFromGroup", () => {
	it("should update active tab to next sibling when removing active child from group", () => {
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
			activeTabIds: { workspace1: "child1" },
			tabHistoryStacks: { workspace1: [] },
		};

		const result = handleRemoveChildTabFromGroup(state, "group1", "child1");

		expect(result.activeTabIds?.workspace1).toBe("child2"); // Should select next sibling
		expect(result.tabs?.find((t) => t.id === "child1")).toBeUndefined(); // Child1 removed
		expect(result.tabs?.find((t) => t.id === "child2")).toBeDefined(); // Child2 still exists
		expect(result.tabs?.find((t) => t.id === "child3")).toBeDefined(); // Child3 still exists
		expect(result.tabs?.find((t) => t.id === "group1")).toBeDefined(); // Group still exists
	});

	it("should update active tab to previous sibling when removing last child from group", () => {
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

		const result = handleRemoveChildTabFromGroup(state, "group1", "child2");

		expect(result.activeTabIds?.workspace1).toBe("child1"); // Should select previous sibling
		expect(result.tabs?.find((t) => t.id === "child2")).toBeUndefined(); // Child2 removed
		expect(result.tabs?.find((t) => t.id === "child1")).toBeDefined(); // Child1 still exists
	});

	it("should not change active tab when removing non-active child from group", () => {
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
			activeTabIds: { workspace1: "child1" },
			tabHistoryStacks: { workspace1: [] },
		};

		const result = handleRemoveChildTabFromGroup(state, "group1", "child2");

		expect(result.activeTabIds?.workspace1).toBe("child1"); // Should remain on child1
		expect(result.tabs?.find((t) => t.id === "child2")).toBeUndefined(); // Child2 removed
		expect(result.tabs?.find((t) => t.id === "child1")).toBeDefined(); // Child1 still exists
	});

	it("should update history stack when removing child tab", () => {
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
			tabHistoryStacks: { workspace1: ["child1", "child2"] },
		};

		const result = handleRemoveChildTabFromGroup(state, "group1", "child2");

		expect(result.tabHistoryStacks?.workspace1).toEqual(["child1"]); // Child2 removed from history
	});

	it("should remove group when last child is removed", () => {
		const state: TabsState = {
			tabs: [
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

		const result = handleRemoveChildTabFromGroup(state, "group1", "child1");

		expect(result.tabs?.find((t) => t.id === "group1")).toBeUndefined(); // Group removed
		expect(result.tabs?.find((t) => t.id === "child1")).toBeUndefined(); // Child removed
		expect(result.activeTabIds?.workspace1).toBeNull(); // No tabs left
	});

	it("should handle removing child with history stack fallback", () => {
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
			tabHistoryStacks: { workspace1: ["child3", "child1"] }, // child3 was most recently used
		};

		const result = handleRemoveChildTabFromGroup(state, "group1", "child2");

		expect(result.activeTabIds?.workspace1).toBe("child3"); // Should prefer history over position
	});
});
