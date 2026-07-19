import { describe, expect, test } from "bun:test";
import {
	clearStatusCacheForWorktree,
	getCachedEffectiveBaseBranch,
	setCachedEffectiveBaseBranch,
} from "./status-cache";

describe("effective base branch status cache", () => {
	test("is scoped by worktree and cleared with its status cache", () => {
		setCachedEffectiveBaseBranch("/worktrees/one", "release");
		setCachedEffectiveBaseBranch("/worktrees/two", "main");

		expect(getCachedEffectiveBaseBranch("/worktrees/one")).toBe("release");
		expect(getCachedEffectiveBaseBranch("/worktrees/two")).toBe("main");

		clearStatusCacheForWorktree("/worktrees/one");

		expect(getCachedEffectiveBaseBranch("/worktrees/one")).toBeNull();
		expect(getCachedEffectiveBaseBranch("/worktrees/two")).toBe("main");
		clearStatusCacheForWorktree("/worktrees/two");
	});
});
