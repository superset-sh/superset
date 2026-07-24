import { describe, expect, it } from "bun:test";
import { getAutoIncludedSubWorkspaceIds } from "./sidebarVisibility";

describe("getAutoIncludedSubWorkspaceIds", () => {
	it("includes nested sub-workspaces whose parent is visible", () => {
		const result = getAutoIncludedSubWorkspaceIds(
			[
				{
					id: "parent",
					projectId: "project",
					type: "worktree",
					parentWorkspaceId: null,
				},
				{
					id: "child",
					projectId: "project",
					type: "subworkspace",
					parentWorkspaceId: "parent",
				},
				{
					id: "grandchild",
					projectId: "project",
					type: "subworkspace",
					parentWorkspaceId: "child",
				},
			],
			{
				localStateWorkspaceIds: new Set(),
				sidebarProjectIds: new Set(["project"]),
				visibleWorkspaceIds: new Set(["parent"]),
			},
		);

		expect([...result]).toEqual(["child", "grandchild"]);
	});

	it("does not override an explicit hidden or moved child", () => {
		const result = getAutoIncludedSubWorkspaceIds(
			[
				{
					id: "child",
					projectId: "project",
					type: "subworkspace",
					parentWorkspaceId: "parent",
				},
			],
			{
				localStateWorkspaceIds: new Set(["child"]),
				sidebarProjectIds: new Set(["project"]),
				visibleWorkspaceIds: new Set(["parent"]),
			},
		);

		expect(result.size).toBe(0);
	});
});
