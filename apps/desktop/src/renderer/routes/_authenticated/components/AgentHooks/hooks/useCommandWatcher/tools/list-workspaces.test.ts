import { describe, expect, it } from "bun:test";
import {
	buildWorkspaceList,
	type WorkspaceListSourceProject,
	type WorkspaceListSourceWorkspace,
} from "./list-workspaces.utils";

describe("buildWorkspaceList", () => {
	it("returns compact workspace summaries with resolved paths and active state", () => {
		const workspaces = [
			{
				id: "workspace-worktree",
				projectId: "project-1",
				type: "worktree",
				branch: "feature/mcp-fix",
				name: "MCP Fix",
			},
			{
				id: "workspace-branch",
				projectId: "project-1",
				type: "branch",
				branch: "main",
				name: "Main",
			},
		] satisfies WorkspaceListSourceWorkspace[];

		const projects = [
			{
				id: "project-1",
				mainRepoPath: "/repos/superset",
			},
		] satisfies WorkspaceListSourceProject[];

		expect(
			buildWorkspaceList({
				workspaces,
				projects,
				activeWorkspaceId: "workspace-worktree",
				getWorktreePathByWorkspaceId: (workspaceId) =>
					workspaceId === "workspace-worktree"
						? "/repos/superset-feature-mcp-fix"
						: undefined,
			}),
		).toEqual([
			{
				id: "workspace-worktree",
				name: "MCP Fix",
				path: "/repos/superset-feature-mcp-fix",
				branch: "feature/mcp-fix",
				isActive: true,
				projectId: "project-1",
				type: "worktree",
			},
			{
				id: "workspace-branch",
				name: "Main",
				path: "/repos/superset",
				branch: "main",
				isActive: false,
				projectId: "project-1",
				type: "branch",
			},
		]);
	});

	it("falls back to an empty path when a worktree path is unavailable", () => {
		const workspaces = [
			{
				id: "workspace-worktree",
				projectId: "project-1",
				type: "worktree",
				branch: "feature/missing-path",
				name: "Missing Path",
			},
		] satisfies WorkspaceListSourceWorkspace[];

		expect(
			buildWorkspaceList({
				workspaces,
				activeWorkspaceId: null,
			}),
		).toEqual([
			{
				id: "workspace-worktree",
				name: "Missing Path",
				path: "",
				branch: "feature/missing-path",
				isActive: false,
				projectId: "project-1",
				type: "worktree",
			},
		]);
	});
});
