import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	getLegacyWorktreePath,
	getWorktreePath,
	getWorktreeRoot,
	getWorktreeSetupPath,
	shouldUseLegacyPaths,
} from "./worktree-config";

describe("worktree-config", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		// Reset environment before each test
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv;
	});

	describe("getWorktreeRoot", () => {
		it("should return default path when no env var is set", () => {
			delete process.env.SUP_WORKTREE_ROOT;
			const expected = join(homedir(), ".superset", "worktrees", "superset");
			expect(getWorktreeRoot()).toBe(expected);
		});

		it("should use SUP_WORKTREE_ROOT env var when set", () => {
			const customRoot = "/custom/worktree/root";
			process.env.SUP_WORKTREE_ROOT = customRoot;
			expect(getWorktreeRoot()).toBe(customRoot);
		});
	});

	describe("getWorktreePath", () => {
		it("should construct path correctly with default root", () => {
			delete process.env.SUP_WORKTREE_ROOT;
			const worktreeName = "azure-cloud-42";
			const expected = join(
				homedir(),
				".superset",
				"worktrees",
				"superset",
				worktreeName,
			);
			expect(getWorktreePath(worktreeName)).toBe(expected);
		});

		it("should construct path correctly with custom root", () => {
			const customRoot = "/custom/worktree/root";
			process.env.SUP_WORKTREE_ROOT = customRoot;
			const worktreeName = "azure-cloud-42";
			const expected = join(customRoot, worktreeName);
			expect(getWorktreePath(worktreeName)).toBe(expected);
		});
	});

	describe("getWorktreeSetupPath", () => {
		it("should construct setup.json path correctly", () => {
			delete process.env.SUP_WORKTREE_ROOT;
			const worktreeName = "azure-cloud-42";
			const expected = join(
				homedir(),
				".superset",
				"worktrees",
				"superset",
				worktreeName,
				"setup.json",
			);
			expect(getWorktreeSetupPath(worktreeName)).toBe(expected);
		});
	});

	describe("getLegacyWorktreePath", () => {
		it("should construct legacy path correctly", () => {
			const mainRepoPath = "/Users/kietho/workplace/superset";
			const worktreeName = "azure-cloud-42";
			const expected = join(mainRepoPath, ".superset", worktreeName);
			expect(getLegacyWorktreePath(mainRepoPath, worktreeName)).toBe(expected);
		});
	});

	describe("shouldUseLegacyPaths", () => {
		it("should return false when env var is not set", () => {
			delete process.env.SUP_USE_LEGACY_PATHS;
			expect(shouldUseLegacyPaths()).toBe(false);
		});

		it("should return true when env var is 'true'", () => {
			process.env.SUP_USE_LEGACY_PATHS = "true";
			expect(shouldUseLegacyPaths()).toBe(true);
		});

		it("should return false when env var is any other value", () => {
			process.env.SUP_USE_LEGACY_PATHS = "false";
			expect(shouldUseLegacyPaths()).toBe(false);

			process.env.SUP_USE_LEGACY_PATHS = "1";
			expect(shouldUseLegacyPaths()).toBe(false);
		});
	});

	describe("path resolution validation", () => {
		it("should resolve to expected structure for git worktree", () => {
			delete process.env.SUP_WORKTREE_ROOT;
			const worktreeName = "lavender-sunset-84";

			// Verify the full path structure matches git worktree expectations
			const worktreePath = getWorktreePath(worktreeName);
			const setupPath = getWorktreeSetupPath(worktreeName);

			// Path should be under ~/.superset/worktrees/superset/
			expect(worktreePath).toContain(".superset/worktrees/superset");
			expect(worktreePath).toEndWith(worktreeName);

			// setup.json should be inside the worktree
			expect(setupPath).toBe(join(worktreePath, "setup.json"));
		});

		it("should maintain backwards compatibility with legacy paths", () => {
			const mainRepoPath = "/Users/kietho/workplace/superset";
			const worktreeName = "lavender-sunset-84";

			// Legacy path should match old structure
			const legacyPath = getLegacyWorktreePath(mainRepoPath, worktreeName);
			expect(legacyPath).toBe(
				"/Users/kietho/workplace/superset/.superset/lavender-sunset-84",
			);
		});
	});
});
