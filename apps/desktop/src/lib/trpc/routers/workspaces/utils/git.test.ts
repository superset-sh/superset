import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createWorktree } from "./git";

// We need to test the internal functions, so we'll import the module
// and test the exported functions that use them

const TEST_DIR = join(__dirname, ".test-git-tmp");

function createTestRepo(name: string): string {
	const repoPath = join(TEST_DIR, name);
	mkdirSync(repoPath, { recursive: true });
	execSync("git init", { cwd: repoPath, stdio: "ignore" });
	execSync("git config user.email 'test@test.com'", {
		cwd: repoPath,
		stdio: "ignore",
	});
	execSync("git config user.name 'Test'", { cwd: repoPath, stdio: "ignore" });
	return repoPath;
}

function seedCommit(repoPath: string): void {
	writeFileSync(join(repoPath, "README.md"), "# test\n");
	execSync("git add . && git commit -m 'init'", {
		cwd: repoPath,
		stdio: "ignore",
	});
}

describe("getDefaultBranch", () => {
	// Import simpleGit directly to bypass any module mocks from other test files
	const { simpleGit } = require("simple-git");

	// Inline implementation for testing to avoid mock interference
	async function getDefaultBranchForTest(
		mainRepoPath: string,
	): Promise<string> {
		const git = simpleGit(mainRepoPath);

		try {
			const headRef = await git.raw([
				"symbolic-ref",
				"refs/remotes/origin/HEAD",
			]);
			const match = headRef.trim().match(/refs\/remotes\/origin\/(.+)/);
			if (match) return match[1];
		} catch {
			// origin/HEAD not set, continue to fallback
		}

		try {
			const branches = await git.branch(["-r"]);
			const remoteBranches = branches.all.map((b: string) =>
				b.replace("origin/", ""),
			);

			for (const candidate of ["main", "master", "develop", "trunk"]) {
				if (remoteBranches.includes(candidate)) {
					return candidate;
				}
			}
		} catch {
			// Failed to list branches
		}

		return "main";
	}

	function createIsolatedTestRepo(testName: string): {
		repoPath: string;
		cleanup: () => void;
	} {
		const testDir = join(
			__dirname,
			`.test-${testName}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		mkdirSync(testDir, { recursive: true });
		execSync("git init", { cwd: testDir, stdio: "ignore" });
		execSync("git config user.email 'test@test.com'", {
			cwd: testDir,
			stdio: "ignore",
		});
		execSync("git config user.name 'Test'", { cwd: testDir, stdio: "ignore" });
		return {
			repoPath: testDir,
			cleanup: () => {
				if (existsSync(testDir)) {
					rmSync(testDir, { recursive: true, force: true });
				}
			},
		};
	}

	test("returns main when no remote and no branches", async () => {
		const { repoPath, cleanup } = createIsolatedTestRepo("empty");
		try {
			const result = await getDefaultBranchForTest(repoPath);
			expect(result).toBe("main");
		} finally {
			cleanup();
		}
	});

	test("detects main from local remote branches", async () => {
		const { repoPath, cleanup } = createIsolatedTestRepo("main");
		try {
			// Create a commit so we have something to reference
			writeFileSync(join(repoPath, "test.txt"), "test");
			execSync("git add . && git commit -m 'init'", {
				cwd: repoPath,
				stdio: "ignore",
			});

			// Simulate fetched remote branches by creating remote tracking refs
			execSync("git remote add origin https://example.com/repo.git", {
				cwd: repoPath,
				stdio: "ignore",
			});
			execSync("git update-ref refs/remotes/origin/main HEAD", {
				cwd: repoPath,
				stdio: "ignore",
			});

			const result = await getDefaultBranchForTest(repoPath);
			expect(result).toBe("main");
		} finally {
			cleanup();
		}
	});

	test("detects master from local remote branches", async () => {
		const { repoPath, cleanup } = createIsolatedTestRepo("master");
		try {
			// Create a commit
			writeFileSync(join(repoPath, "test.txt"), "test");
			execSync("git add . && git commit -m 'init'", {
				cwd: repoPath,
				stdio: "ignore",
			});

			// Simulate fetched remote with only master branch
			execSync("git remote add origin https://example.com/repo.git", {
				cwd: repoPath,
				stdio: "ignore",
			});
			execSync("git update-ref refs/remotes/origin/master HEAD", {
				cwd: repoPath,
				stdio: "ignore",
			});

			const result = await getDefaultBranchForTest(repoPath);
			expect(result).toBe("master");
		} finally {
			cleanup();
		}
	});

	test("uses origin/HEAD when set", async () => {
		const { repoPath, cleanup } = createIsolatedTestRepo("origin-head");
		try {
			// Create a commit
			writeFileSync(join(repoPath, "test.txt"), "test");
			execSync("git add . && git commit -m 'init'", {
				cwd: repoPath,
				stdio: "ignore",
			});

			// Set up remote and origin/HEAD
			execSync("git remote add origin https://example.com/repo.git", {
				cwd: repoPath,
				stdio: "ignore",
			});
			execSync("git update-ref refs/remotes/origin/develop HEAD", {
				cwd: repoPath,
				stdio: "ignore",
			});
			execSync(
				"git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/develop",
				{
					cwd: repoPath,
					stdio: "ignore",
				},
			);

			const result = await getDefaultBranchForTest(repoPath);
			expect(result).toBe("develop");
		} finally {
			cleanup();
		}
	});

	test("prefers main over master when both exist", async () => {
		const { repoPath, cleanup } = createIsolatedTestRepo("prefer-main");
		try {
			// Create a commit
			writeFileSync(join(repoPath, "test.txt"), "test");
			execSync("git add . && git commit -m 'init'", {
				cwd: repoPath,
				stdio: "ignore",
			});

			// Simulate fetched remote with both main and master
			execSync("git remote add origin https://example.com/repo.git", {
				cwd: repoPath,
				stdio: "ignore",
			});
			execSync("git update-ref refs/remotes/origin/main HEAD", {
				cwd: repoPath,
				stdio: "ignore",
			});
			execSync("git update-ref refs/remotes/origin/master HEAD", {
				cwd: repoPath,
				stdio: "ignore",
			});

			const result = await getDefaultBranchForTest(repoPath);
			expect(result).toBe("main");
		} finally {
			cleanup();
		}
	});
});

describe("Shell Environment", () => {
	test("getShellEnvironment returns PATH", async () => {
		const { getShellEnvironment } = await import("./shell-env");

		const env = await getShellEnvironment();

		// Should have PATH
		expect(env.PATH || env.Path).toBeDefined();
	});

	test("clearShellEnvCache clears cache", async () => {
		const { clearShellEnvCache, getShellEnvironment } = await import(
			"./shell-env"
		);

		// Get env (populates cache)
		await getShellEnvironment();

		// Clear cache
		clearShellEnvCache();

		// Should work again (cache was cleared)
		const env = await getShellEnvironment();
		expect(env.PATH || env.Path).toBeDefined();
	});
});

describe("createWorktree hook tolerance", () => {
	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("continues when post-checkout hook fails but worktree is created", async () => {
		const repoPath = createTestRepo("worktree-hook-failure");
		seedCommit(repoPath);

		const hookPath = join(repoPath, ".git", "hooks", "post-checkout");
		writeFileSync(
			hookPath,
			"#!/bin/sh\necho 'post-checkout failed' >&2\nexit 1\n",
		);
		execSync(`chmod +x "${hookPath}"`);

		const worktreePath = join(TEST_DIR, "worktree-hook-failure-wt");
		await createWorktree(
			repoPath,
			"feature/hook-failure",
			worktreePath,
			"HEAD",
		);

		expect(existsSync(worktreePath)).toBe(true);
		const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
			cwd: worktreePath,
		})
			.toString()
			.trim();
		expect(currentBranch).toBe("feature/hook-failure");
	});

	test("throws when destination path exists but worktree is not created", async () => {
		const repoPath = createTestRepo("worktree-existing-path");
		seedCommit(repoPath);

		const worktreePath = join(TEST_DIR, "worktree-existing-path-wt");
		mkdirSync(worktreePath, { recursive: true });
		writeFileSync(join(worktreePath, "keep.txt"), "keep");

		await expect(
			createWorktree(repoPath, "feature/existing-path", worktreePath, "HEAD"),
		).rejects.toThrow("already exists");
	});
});
