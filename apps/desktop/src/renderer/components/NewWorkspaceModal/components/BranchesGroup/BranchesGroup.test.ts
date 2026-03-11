import { describe, expect, test } from "bun:test";
import { buildCreateWorkspaceFromBranchInput } from "./buildCreateWorkspaceFromBranchInput";

describe("buildCreateWorkspaceFromBranchInput", () => {
	test("creates a worktree workspace request for an existing branch", () => {
		expect(
			buildCreateWorkspaceFromBranchInput(
				"project-123",
				"feature/fix-worktree-regression",
			),
		).toEqual({
			projectId: "project-123",
			branchName: "feature/fix-worktree-regression",
			useExistingBranch: true,
			applyPrefix: false,
		});
	});
});
