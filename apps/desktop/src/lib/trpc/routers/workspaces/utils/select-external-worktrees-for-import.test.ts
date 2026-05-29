import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
			requested: new Set(["/repos/wt-a", "/repos/wt-c"]),
		});
		expect(result.map((w) => w.path)).toEqual(["/repos/wt-a", "/repos/wt-c"]);
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
			requested: new Set(),
		});
		expect(result).toEqual([]);
	});
});

// Repro for #4989: on macOS, repos on external drives are reached through
// `/Volumes/...` mount aliases (symlinks/firmlinks), but `git worktree list`
// reports the realpath-resolved location. The user-provided main repo path and
// requested paths therefore never string-match git's output, so import either
// does nothing or wrongly treats the main repo as an importable worktree.
describe("selectExternalWorktreesForImport with symlinked (external-drive-style) paths", () => {
	let realBase: string;
	let aliasBase: string;

	beforeAll(() => {
		// `realBase` stands in for the canonical path git reports.
		realBase = realpathSync(mkdtempSync(join(tmpdir(), "superset-real-")));
		mkdirSync(join(realBase, "main"));
		mkdirSync(join(realBase, "wt-a"));

		// `aliasBase` stands in for the `/Volumes/...` symlinked mount the user
		// selected when adding the project and importing.
		aliasBase = `${realBase}-alias`;
		symlinkSync(realBase, aliasBase);
	});

	afterAll(() => {
		rmSync(aliasBase, { force: true });
		rmSync(realBase, { recursive: true, force: true });
	});

	test("matches a requested worktree reached via a symlinked path", () => {
		// git reports canonical paths; the UI requests the aliased path.
		const gitWorktrees = [
			wt({ path: join(realBase, "main"), branch: "main" }),
			wt({ path: join(realBase, "wt-a"), branch: "feature-a" }),
		];

		const result = selectExternalWorktreesForImport(gitWorktrees, {
			mainRepoPath: join(aliasBase, "main"),
			requested: new Set([join(aliasBase, "wt-a")]),
		});

		expect(result.map((w) => w.branch)).toEqual(["feature-a"]);
	});

	test("excludes the main repo reached via a symlinked path", () => {
		const gitWorktrees = [
			wt({ path: join(realBase, "main"), branch: "main" }),
			wt({ path: join(realBase, "wt-a"), branch: "feature-a" }),
		];

		const result = selectExternalWorktreesForImport(gitWorktrees, {
			mainRepoPath: join(aliasBase, "main"),
		});

		expect(result.map((w) => w.branch)).toEqual(["feature-a"]);
	});
});
