import { describe, expect, test } from "bun:test";
import { toOpenWorkspaceTarget } from "./openWorkspaceTarget";

describe("toOpenWorkspaceTarget", () => {
	test("preserves explicit worktree paths for worktree rows", () => {
		expect(
			toOpenWorkspaceTarget({
				name: "feature/from-picker",
				worktreePath: "/repos/app/.worktrees/feature-from-picker",
			}),
		).toEqual({
			branchName: "feature/from-picker",
			worktreePath: "/repos/app/.worktrees/feature-from-picker",
		});
	});

	test("omits worktreePath for normal branch rows", () => {
		expect(
			toOpenWorkspaceTarget({
				name: "main",
				worktreePath: null,
			}),
		).toEqual({ branchName: "main" });
	});
});
