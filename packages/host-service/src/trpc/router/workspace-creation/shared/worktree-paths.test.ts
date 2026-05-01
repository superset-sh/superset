import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { safeResolveWorktreePath } from "./worktree-paths";

describe("safeResolveWorktreePath", () => {
	test("defaults to ~/.superset/worktrees/<projectId>/<branch> when no base dir is provided", () => {
		const result = safeResolveWorktreePath("project-id", "feature/foo");
		expect(result).toBe(
			join(homedir(), ".superset", "worktrees", "project-id", "feature/foo"),
		);
	});

	// Reproduces issue #3929: users can configure a worktree location in
	// Settings, but the v2 workspace-creation flow ignores that setting and
	// always creates worktrees under ~/.superset/worktrees/. The host-service
	// `safeResolveWorktreePath` has no parameter for accepting a configured
	// base dir, so the user setting cannot be honored.
	test("honors a user-configured worktree base dir when supplied (#3929)", () => {
		const customBase = join(homedir(), "code", "my-worktrees");
		const result = safeResolveWorktreePath(
			"project-id",
			"feature/foo",
			customBase,
		);
		expect(result).toBe(join(customBase, "project-id", "feature/foo"));
	});

	test("rejects path traversal in branch name", () => {
		expect(() => safeResolveWorktreePath("project-id", "../escape")).toThrow(
			/path traversal/,
		);
	});

	test("rejects path traversal even with a custom base dir (#3929)", () => {
		const customBase = join(homedir(), "code", "my-worktrees");
		expect(() =>
			safeResolveWorktreePath("project-id", "../escape", customBase),
		).toThrow(/path traversal/);
	});
});
