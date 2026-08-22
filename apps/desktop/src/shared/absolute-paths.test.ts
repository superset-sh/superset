import { describe, expect, it } from "bun:test";
import { isWithinWorkspacePath } from "./absolute-paths";

describe("isWithinWorkspacePath", () => {
	const root = "/Users/dev/worktrees/my-branch";

	it("accepts the worktree root itself", () => {
		expect(isWithinWorkspacePath(root, root)).toBe(true);
		expect(isWithinWorkspacePath(`${root}/`, root)).toBe(true);
	});

	it("accepts paths nested inside the worktree", () => {
		expect(isWithinWorkspacePath(root, `${root}/src/components`)).toBe(true);
	});

	it("rejects paths outside the worktree", () => {
		expect(isWithinWorkspacePath(root, "/Users/dev/Downloads")).toBe(false);
		expect(isWithinWorkspacePath(root, "/tmp")).toBe(false);
	});

	it("rejects sibling paths sharing the root as a prefix", () => {
		expect(
			isWithinWorkspacePath(root, "/Users/dev/worktrees/my-branch-2"),
		).toBe(false);
	});

	it("normalizes separators and windows drive letters", () => {
		expect(isWithinWorkspacePath("C:\\repo", "c:/repo/src")).toBe(true);
	});

	it("collapses dot segments so traversal can't fake containment", () => {
		expect(isWithinWorkspacePath(root, `${root}/../outside`)).toBe(false);
		expect(isWithinWorkspacePath(root, `${root}/./src/../apps`)).toBe(true);
		expect(
			isWithinWorkspacePath(root, "/Users/dev/../dev/worktrees/my-branch/apps"),
		).toBe(true);
	});
});
