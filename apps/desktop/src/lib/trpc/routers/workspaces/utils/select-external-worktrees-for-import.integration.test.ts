import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listExternalWorktrees } from "./git";
import { selectExternalWorktreesForImport } from "./select-external-worktrees-for-import";

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-test-select-import-${process.pid}`,
);

function createTestRepo(name: string): string {
	const repoPath = join(TEST_DIR, name);
	mkdirSync(repoPath, { recursive: true });
	execSync("git init -b main", { cwd: repoPath, stdio: "ignore" });
	execSync("git config user.email 'test@test.com'", {
		cwd: repoPath,
		stdio: "ignore",
	});
	execSync("git config user.name 'Test'", { cwd: repoPath, stdio: "ignore" });
	writeFileSync(join(repoPath, "README.md"), "# test\n");
	execSync("git add . && git commit -m 'init'", {
		cwd: repoPath,
		stdio: "ignore",
	});
	return repoPath;
}

function addWorktree(
	mainRepoPath: string,
	branch: string,
	worktreePath: string,
): void {
	mkdirSync(worktreePath, { recursive: true });
	execSync(`git worktree add "${worktreePath}" -b ${branch}`, {
		cwd: mainRepoPath,
		stdio: "ignore",
	});
}

function addDetachedWorktree(mainRepoPath: string, worktreePath: string): void {
	mkdirSync(worktreePath, { recursive: true });
	execSync(`git worktree add --detach "${worktreePath}" HEAD`, {
		cwd: mainRepoPath,
		stdio: "ignore",
	});
}

describe("selectExternalWorktreesForImport (real git worktrees)", () => {
	let mainRepoPath: string;
	let wtA: string;
	let wtB: string;
	let wtC: string;

	beforeEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
		mkdirSync(TEST_DIR, { recursive: true });
		mainRepoPath = createTestRepo("main-repo");
		wtA = join(TEST_DIR, "wt-a");
		wtB = join(TEST_DIR, "wt-b");
		wtC = join(TEST_DIR, "wt-c");
		addWorktree(mainRepoPath, "feat-a", wtA);
		addWorktree(mainRepoPath, "feat-b", wtB);
		addWorktree(mainRepoPath, "feat-c", wtC);
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("with no requested filter, returns all three external worktrees and excludes main repo", async () => {
		const all = await listExternalWorktrees(mainRepoPath);
		expect(all.map((w) => w.path).sort()).toEqual(
			[mainRepoPath, wtA, wtB, wtC].sort(),
		);

		const result = selectExternalWorktreesForImport(all, {
			mainRepoPath,
			trackedPaths: new Set(),
		});
		expect(result.map((w) => w.path).sort()).toEqual([wtA, wtB, wtC].sort());
		expect(result.map((w) => w.branch).sort()).toEqual(
			["feat-a", "feat-b", "feat-c"].sort(),
		);
	});

	test("with requested = {wtA, wtC}, returns only those two", async () => {
		const all = await listExternalWorktrees(mainRepoPath);

		const result = selectExternalWorktreesForImport(all, {
			mainRepoPath,
			trackedPaths: new Set(),
			requested: new Set([wtA, wtC]),
		});
		expect(result.map((w) => w.path).sort()).toEqual([wtA, wtC].sort());
	});

	test("paths already tracked in the DB are skipped even when requested", async () => {
		const all = await listExternalWorktrees(mainRepoPath);

		const result = selectExternalWorktreesForImport(all, {
			mainRepoPath,
			trackedPaths: new Set([wtB]),
			requested: new Set([wtA, wtB, wtC]),
		});
		expect(result.map((w) => w.path).sort()).toEqual([wtA, wtC].sort());
	});

	test("requested set containing a path that no longer exists is silently ignored", async () => {
		const all = await listExternalWorktrees(mainRepoPath);
		const ghostPath = join(TEST_DIR, "wt-ghost");

		const result = selectExternalWorktreesForImport(all, {
			mainRepoPath,
			trackedPaths: new Set(),
			requested: new Set([wtA, ghostPath]),
		});
		expect(result.map((w) => w.path)).toEqual([wtA]);
	});

	test("detached HEAD worktrees are skipped even when requested", async () => {
		const wtDetached = join(TEST_DIR, "wt-detached");
		addDetachedWorktree(mainRepoPath, wtDetached);

		const all = await listExternalWorktrees(mainRepoPath);
		const detachedEntry = all.find((w) => w.path === wtDetached);
		expect(detachedEntry).toBeDefined();
		expect(detachedEntry?.isDetached).toBe(true);

		const result = selectExternalWorktreesForImport(all, {
			mainRepoPath,
			trackedPaths: new Set(),
			requested: new Set([wtA, wtDetached]),
		});
		expect(result.map((w) => w.path)).toEqual([wtA]);
	});

	test("empty requested set returns no worktrees", async () => {
		const all = await listExternalWorktrees(mainRepoPath);

		const result = selectExternalWorktreesForImport(all, {
			mainRepoPath,
			trackedPaths: new Set(),
			requested: new Set(),
		});
		expect(result).toEqual([]);
	});

	test("main repo path in the requested set never gets imported", async () => {
		const all = await listExternalWorktrees(mainRepoPath);

		const result = selectExternalWorktreesForImport(all, {
			mainRepoPath,
			trackedPaths: new Set(),
			requested: new Set([mainRepoPath, wtA]),
		});
		expect(result.map((w) => w.path)).toEqual([wtA]);
	});

	test("re-running selection after one worktree is marked tracked converges", async () => {
		const all = await listExternalWorktrees(mainRepoPath);

		// First pass: import wtA only
		const firstPass = selectExternalWorktreesForImport(all, {
			mainRepoPath,
			trackedPaths: new Set(),
			requested: new Set([wtA]),
		});
		expect(firstPass.map((w) => w.path)).toEqual([wtA]);

		// Simulate wtA now being tracked. A second pass with all three requested
		// should return only wtB and wtC.
		const secondPass = selectExternalWorktreesForImport(all, {
			mainRepoPath,
			trackedPaths: new Set([wtA]),
			requested: new Set([wtA, wtB, wtC]),
		});
		expect(secondPass.map((w) => w.path).sort()).toEqual([wtB, wtC].sort());
	});
});
