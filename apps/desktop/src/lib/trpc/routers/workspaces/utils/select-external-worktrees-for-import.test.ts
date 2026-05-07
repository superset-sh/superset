import { describe, expect, test } from "bun:test";
import type { ExternalWorktree } from "./git";
import { selectExternalWorktreesForImport } from "./select-external-worktrees-for-import";

function wt(overrides: Partial<ExternalWorktree>): ExternalWorktree {
	return {
		path: "/tmp/wt",
		branch: "feature",
		isBare: false,
		isDetached: false,
		...overrides,
	};
}

describe("selectExternalWorktreesForImport", () => {
	const mainRepoPath = "/repos/main";

	test("returns all eligible worktrees when no requested filter", () => {
		const worktrees = [
			wt({ path: "/repos/wt-a", branch: "feature-a" }),
			wt({ path: "/repos/wt-b", branch: "feature-b" }),
		];
		const result = selectExternalWorktreesForImport(worktrees, {
			mainRepoPath,
			trackedPaths: new Set(),
		});
		expect(result.map((w) => w.path)).toEqual(["/repos/wt-a", "/repos/wt-b"]);
	});

	test("filters to only requested paths", () => {
		const worktrees = [
			wt({ path: "/repos/wt-a", branch: "feature-a" }),
			wt({ path: "/repos/wt-b", branch: "feature-b" }),
			wt({ path: "/repos/wt-c", branch: "feature-c" }),
		];
		const result = selectExternalWorktreesForImport(worktrees, {
			mainRepoPath,
			trackedPaths: new Set(),
			requested: new Set(["/repos/wt-a", "/repos/wt-c"]),
		});
		expect(result.map((w) => w.path)).toEqual(["/repos/wt-a", "/repos/wt-c"]);
	});

	test("requested paths that are already tracked are skipped", () => {
		const worktrees = [
			wt({ path: "/repos/wt-a", branch: "feature-a" }),
			wt({ path: "/repos/wt-b", branch: "feature-b" }),
		];
		const result = selectExternalWorktreesForImport(worktrees, {
			mainRepoPath,
			trackedPaths: new Set(["/repos/wt-b"]),
			requested: new Set(["/repos/wt-a", "/repos/wt-b"]),
		});
		expect(result.map((w) => w.path)).toEqual(["/repos/wt-a"]);
	});

	test("requested paths that are bare/detached/branchless are skipped", () => {
		const worktrees = [
			wt({ path: "/repos/wt-a", branch: "feature-a" }),
			wt({ path: "/repos/wt-bare", isBare: true }),
			wt({ path: "/repos/wt-detached", isDetached: true, branch: null }),
			wt({ path: "/repos/wt-no-branch", branch: null }),
		];
		const result = selectExternalWorktreesForImport(worktrees, {
			mainRepoPath,
			trackedPaths: new Set(),
			requested: new Set([
				"/repos/wt-a",
				"/repos/wt-bare",
				"/repos/wt-detached",
				"/repos/wt-no-branch",
			]),
		});
		expect(result.map((w) => w.path)).toEqual(["/repos/wt-a"]);
	});

	test("main repo path is never included even when requested", () => {
		const worktrees = [
			wt({ path: mainRepoPath, branch: "main" }),
			wt({ path: "/repos/wt-a", branch: "feature-a" }),
		];
		const result = selectExternalWorktreesForImport(worktrees, {
			mainRepoPath,
			trackedPaths: new Set(),
			requested: new Set([mainRepoPath, "/repos/wt-a"]),
		});
		expect(result.map((w) => w.path)).toEqual(["/repos/wt-a"]);
	});

	test("empty requested set returns no worktrees", () => {
		const worktrees = [
			wt({ path: "/repos/wt-a", branch: "feature-a" }),
			wt({ path: "/repos/wt-b", branch: "feature-b" }),
		];
		const result = selectExternalWorktreesForImport(worktrees, {
			mainRepoPath,
			trackedPaths: new Set(),
			requested: new Set(),
		});
		expect(result).toEqual([]);
	});
});
