import { describe, test } from "bun:test";

// PR #3893 (canonical workspaces.create) removed the workspaceCreation
// procedures these tests exercised: getContext, getProgress, and
// generateBranchName (the last moved to workspaces.generateBranchName).
// The progress store is also gone. Re-author against the new surfaces
// when there's coverage to add.
describe("workspaceCreation misc procedures", () => {
	test.todo("getContext reports hasLocalRepo=false for unknown project");
	test.todo("getContext returns defaultBranch when project exists locally");
	test.todo("getProgress returns null for unknown pendingId");
	test.todo("getProgress reflects state set via the in-memory store");
	test.todo("generateBranchName returns null for empty prompts (no AI call)");
	test.todo("generateBranchName returns null when project is unknown");
});
