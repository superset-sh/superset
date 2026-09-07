import { describe, expect, test } from "bun:test";
import { shouldRemoveWorktreeDirectory } from "./worktree-delete-policy";

describe("shouldRemoveWorktreeDirectory", () => {
	test("removes Superset-created worktrees from disk", () => {
		expect(shouldRemoveWorktreeDirectory({ createdBySuperset: true })).toBe(
			true,
		);
	});

	test("preserves imported external worktrees on disk", () => {
		expect(shouldRemoveWorktreeDirectory({ createdBySuperset: false })).toBe(
			false,
		);
	});
});
