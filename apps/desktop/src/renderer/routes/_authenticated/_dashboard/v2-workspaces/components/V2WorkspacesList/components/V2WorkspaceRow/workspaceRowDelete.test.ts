import { describe, expect, test } from "bun:test";
import {
	buildWorkspaceDeleteIntent,
	isWorkspaceDeletable,
} from "./workspaceRowDelete";

describe("workspaceRowDelete", () => {
	// Reproduces #5140: the workspaces overview offered no way to delete a
	// worktree workspace, so unused workspaces piled up. A worktree row must
	// expose a Delete affordance.
	test("worktree workspaces are deletable from the overview", () => {
		expect(isWorkspaceDeletable({ type: "worktree" })).toBe(true);
	});

	// Main workspaces are not normal delete targets — the server rejects the
	// delete saga for them — so the overview must not offer Delete for them.
	test("main workspaces are not deletable from the overview", () => {
		expect(isWorkspaceDeletable({ type: "main" })).toBe(false);
	});

	test("delete intent carries the workspace id and name for the dialog", () => {
		expect(
			buildWorkspaceDeleteIntent({ id: "ws_1", name: "feature/login" }),
		).toEqual({
			workspaceId: "ws_1",
			workspaceName: "feature/login",
		});
	});
});
