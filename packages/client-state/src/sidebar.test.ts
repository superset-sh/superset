import { describe, expect, test } from "bun:test";
import { EMPTY_SIDEBAR_STATE } from "./schema";
import { applySidebarCommand } from "./sidebar";

describe("applySidebarCommand", () => {
	test("creates, renames, collapses, and deletes a group", () => {
		let state = applySidebarCommand(EMPTY_SIDEBAR_STATE, {
			action: "create-group",
			groupId: "group-1",
			projectId: "project-1",
			name: "  Review  ",
		});
		expect(state.groups[0]).toMatchObject({
			id: "group-1",
			name: "Review",
			isCollapsed: false,
		});

		state = applySidebarCommand(state, {
			action: "rename-group",
			groupId: "group-1",
			name: "Ready",
		});
		state = applySidebarCommand(state, {
			action: "set-group-collapsed",
			groupId: "group-1",
			collapsed: true,
		});
		expect(state.groups[0]).toMatchObject({
			name: "Ready",
			isCollapsed: true,
		});

		state = applySidebarCommand(state, {
			action: "delete-group",
			groupId: "group-1",
		});
		expect(state.groups).toEqual([]);
	});

	test("materializes and moves a workspace without crossing projects", () => {
		let state = applySidebarCommand(EMPTY_SIDEBAR_STATE, {
			action: "create-group",
			groupId: "group-1",
			projectId: "project-1",
			name: "Review",
		});
		state = applySidebarCommand(state, {
			action: "move-workspace",
			workspaceId: "workspace-1",
			projectId: "project-1",
			groupId: "group-1",
		});
		expect(state.workspaces[0]).toMatchObject({
			id: "workspace-1",
			projectId: "project-1",
			groupId: "group-1",
			isHidden: false,
		});

		expect(() =>
			applySidebarCommand(state, {
				action: "move-workspace",
				workspaceId: "workspace-2",
				projectId: "project-2",
				groupId: "group-1",
			}),
		).toThrow("same project");
	});

	test("deleting a group preserves and ungroups its workspaces", () => {
		let state = applySidebarCommand(EMPTY_SIDEBAR_STATE, {
			action: "create-group",
			groupId: "group-1",
			projectId: "project-1",
			name: "Review",
		});
		for (const workspaceId of ["workspace-1", "workspace-2"]) {
			state = applySidebarCommand(state, {
				action: "move-workspace",
				workspaceId,
				projectId: "project-1",
				groupId: "group-1",
			});
		}
		state = applySidebarCommand(state, {
			action: "delete-group",
			groupId: "group-1",
		});
		expect(state.workspaces).toHaveLength(2);
		expect(state.workspaces.map((workspace) => workspace.groupId)).toEqual([
			null,
			null,
		]);
	});
});
