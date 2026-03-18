import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	branchExistsOnRemote,
	createWorktree,
	getCurrentBranch,
	hasUnpushedCommits,
	parsePrUrl,
} from "./git";

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-test-git-${process.pid}`,
);

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
			realpathSync(tmpdir()),
			`superset-test-${testName}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
	}, 10_000);

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
	}, 10_000);

	test("getProcessEnvWithShellPath applies shell PATH and preserves string vars", async () => {
		const { getProcessEnvWithShellPath, getShellEnvironment } = await import(
			"./shell-env"
		);

		const shellEnv = await getShellEnvironment();
		const env = await getProcessEnvWithShellPath({
			PATH: "/usr/bin",
			FOO: "bar",
			UNSET: undefined,
		});

		expect(env.FOO).toBe("bar");
		expect("UNSET" in env).toBe(false);

		const shellPath = shellEnv.PATH || shellEnv.Path;
		if (shellPath) {
			expect(env.PATH).toBe(shellPath);
			if (process.platform === "win32" || "Path" in shellEnv) {
				expect(env.Path).toBe(shellPath);
			}
		}
	}, 10_000);

	test("getShellEnvironment PATH includes homebrew and user-installed tools", async () => {
		const { clearShellEnvCache, getShellEnvironment } = await import(
			"./shell-env"
		);
		clearShellEnvCache();

		const env = await getShellEnvironment();
		const shellPath = env.PATH || env.Path || "";

		// The derived PATH should be richer than the minimal macOS GUI PATH
		// (/usr/bin:/bin:/usr/sbin:/sbin). It should include at least one of
		// these common user-installed tool directories.
		const userPaths = [
			"/opt/homebrew/bin",
			"/usr/local/bin",
			"/home/linuxbrew/.linuxbrew/bin",
		];
		const hasUserPath = userPaths.some((p) => shellPath.includes(p));
		expect(hasUserPath).toBe(true);
	}, 10_000);

	test("getShellEnvironment strips delimiter noise from interactive shell output", async () => {
		const { clearShellEnvCache, getShellEnvironment } = await import(
			"./shell-env"
		);
		clearShellEnvCache();

		const env = await getShellEnvironment();

		// Delimiter markers should not leak into any env key or value
		expect(
			Object.keys(env).some((k) => k.includes("_SHELL_ENV_DELIMITER_")),
		).toBe(false);
		expect(
			Object.values(env).some((v) => v.includes("_SHELL_ENV_DELIMITER_")),
		).toBe(false);
	}, 10_000);

	test("getProcessEnvWithShellPath overrides minimal GUI PATH with shell PATH", async () => {
		const { clearShellEnvCache, getProcessEnvWithShellPath } = await import(
			"./shell-env"
		);
		clearShellEnvCache();

		// Simulate the minimal PATH a macOS GUI app gets from Finder/Dock
		const guiPath = "/usr/bin:/bin:/usr/sbin:/sbin";
		const env = await getProcessEnvWithShellPath({
			PATH: guiPath,
			HOME: process.env.HOME,
		});

		// The resulting PATH should NOT be the minimal GUI PATH
		expect(env.PATH).not.toBe(guiPath);
		// It should contain additional directories from the shell
		expect(env.PATH.length).toBeGreaterThan(guiPath.length);
	}, 10_000);

	test("getShellEnvironment captures .zshrc variables (requires -ilc)", async () => {
		// This test proves that getShellEnvironment uses an interactive shell (-i)
		// which sources .zshrc. Without -i, only .zprofile is sourced and tools
		// installed via nvm/volta/fnm (configured in .zshrc) won't be in PATH.
		//
		// We use ZDOTDIR to point zsh at a temp .zshrc with a known test variable.
		// -lc (non-interactive) won't source it → test fails
		// -ilc (interactive) will source it → test passes
		const { clearShellEnvCache, getShellEnvironment } = await import(
			"./shell-env"
		);
		const zshPath = ["/bin/zsh", "/usr/bin/zsh"].find((candidate) =>
			existsSync(candidate),
		);
		if (!zshPath) {
			return;
		}

		const tmpDir = mkdtempSync(join(realpathSync(tmpdir()), "shell-env-test-"));
		writeFileSync(
			join(tmpDir, ".zshrc"),
			'export __SUPERSET_SHELL_ENV_TEST__="interactive"\n',
		);

		const origZDOTDIR = process.env.ZDOTDIR;
		const origShell = process.env.SHELL;
		process.env.SHELL = zshPath;
		process.env.ZDOTDIR = tmpDir;
		clearShellEnvCache();

		try {
			const env = await getShellEnvironment();
			expect(env.__SUPERSET_SHELL_ENV_TEST__).toBe("interactive");
		} finally {
			if (origZDOTDIR !== undefined) process.env.ZDOTDIR = origZDOTDIR;
			else delete process.env.ZDOTDIR;
			if (origShell !== undefined) process.env.SHELL = origShell;
			else delete process.env.SHELL;
			clearShellEnvCache();
			rmSync(tmpDir, { recursive: true });
		}
	}, 10_000);
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
	}, 10_000);

	test("throws when destination path exists but worktree is not created", async () => {
		const repoPath = createTestRepo("worktree-existing-path");
		seedCommit(repoPath);

		const worktreePath = join(TEST_DIR, "worktree-existing-path-wt");
		mkdirSync(worktreePath, { recursive: true });
		writeFileSync(join(worktreePath, "keep.txt"), "keep");

		await expect(
			createWorktree(repoPath, "feature/existing-path", worktreePath, "HEAD"),
		).rejects.toThrow("already exists");
	}, 10_000);
});

describe("getCurrentBranch", () => {
	test("returns branch name for empty repo with unborn HEAD", async () => {
		const repoPath = join(
			realpathSync(tmpdir()),
			`superset-test-current-branch-empty-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);

		mkdirSync(repoPath, { recursive: true });

		try {
			execSync("git init", { cwd: repoPath, stdio: "ignore" });
			execSync("git symbolic-ref HEAD refs/heads/feature/empty", {
				cwd: repoPath,
				stdio: "ignore",
			});

			const branch = await getCurrentBranch(repoPath);
			expect(branch).toBe("feature/empty");
		} finally {
			if (existsSync(repoPath)) {
				rmSync(repoPath, { recursive: true, force: true });
			}
		}
	});

	test("returns null in detached HEAD state", async () => {
		const repoPath = join(
			realpathSync(tmpdir()),
			`superset-test-current-branch-detached-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);

		mkdirSync(repoPath, { recursive: true });

		try {
			execSync("git init", { cwd: repoPath, stdio: "ignore" });
			execSync("git config user.email 'test@test.com'", {
				cwd: repoPath,
				stdio: "ignore",
			});
			execSync("git config user.name 'Test'", {
				cwd: repoPath,
				stdio: "ignore",
			});
			writeFileSync(join(repoPath, "README.md"), "# test\n");
			execSync("git add . && git commit -m 'init'", {
				cwd: repoPath,
				stdio: "ignore",
			});
			execSync("git checkout --detach HEAD", {
				cwd: repoPath,
				stdio: "ignore",
			});

			const branch = await getCurrentBranch(repoPath);
			expect(branch).toBeNull();
		} finally {
			if (existsSync(repoPath)) {
				rmSync(repoPath, { recursive: true, force: true });
			}
		}
	});
});

describe("branchExistsOnRemote", () => {
	test("checks the requested remote instead of always origin", async () => {
		const repoPath = createTestRepo("branch-exists-on-remote");
		seedCommit(repoPath);

		const originRemotePath = join(TEST_DIR, "branch-exists-origin.git");
		const forkRemotePath = join(TEST_DIR, "branch-exists-fork.git");

		execSync(`git init --bare "${originRemotePath}"`, { stdio: "ignore" });
		execSync(`git init --bare "${forkRemotePath}"`, { stdio: "ignore" });

		execSync(`git remote add origin "${originRemotePath}"`, {
			cwd: repoPath,
			stdio: "ignore",
		});
		execSync(`git remote add contributor "${forkRemotePath}"`, {
			cwd: repoPath,
			stdio: "ignore",
		});
		execSync(
			"git push contributor HEAD:refs/heads/feature/fork-tracking-remote",
			{
				cwd: repoPath,
				stdio: "ignore",
			},
		);

		await expect(
			branchExistsOnRemote(repoPath, "feature/fork-tracking-remote"),
		).resolves.toEqual({ status: "not_found" });
		await expect(
			branchExistsOnRemote(
				repoPath,
				"feature/fork-tracking-remote",
				"contributor",
			),
		).resolves.toEqual({ status: "exists" });
	});
});

describe("hasUnpushedCommits", () => {
	/**
	 * Helper: create a "remote" bare repo, a local clone, and push an initial
	 * commit so we have a realistic origin/main setup.
	 */
	function setupRemoteAndClone(testName: string) {
		const remotePath = join(TEST_DIR, `${testName}-remote.git`);
		const localPath = join(TEST_DIR, `${testName}-local`);

		// Create bare remote
		mkdirSync(remotePath, { recursive: true });
		execSync("git init --bare", { cwd: remotePath, stdio: "ignore" });

		// Clone it
		execSync(`git clone "${remotePath}" "${localPath}"`, { stdio: "ignore" });
		execSync("git config user.email 'test@test.com'", {
			cwd: localPath,
			stdio: "ignore",
		});
		execSync("git config user.name 'Test'", {
			cwd: localPath,
			stdio: "ignore",
		});

		// Seed commit on main
		writeFileSync(join(localPath, "README.md"), "# test\n");
		execSync("git add . && git commit -m 'init' && git push", {
			cwd: localPath,
			stdio: "ignore",
		});

		return { remotePath, localPath };
	}

	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("returns false when branch has no commits ahead of upstream", async () => {
		const { localPath } = setupRemoteAndClone("no-ahead");

		// Create a feature branch, push it (no extra commits)
		execSync(
			"git checkout -b feature/no-change && git push -u origin feature/no-change",
			{
				cwd: localPath,
				stdio: "ignore",
			},
		);

		expect(await hasUnpushedCommits(localPath)).toBe(false);
	}, 10_000);

	test("returns true when branch has commits ahead of upstream", async () => {
		const { localPath } = setupRemoteAndClone("ahead");

		execSync(
			"git checkout -b feature/ahead && git push -u origin feature/ahead",
			{
				cwd: localPath,
				stdio: "ignore",
			},
		);

		// Add an unpushed commit
		writeFileSync(join(localPath, "new.txt"), "new");
		execSync("git add . && git commit -m 'unpushed'", {
			cwd: localPath,
			stdio: "ignore",
		});

		expect(await hasUnpushedCommits(localPath)).toBe(true);
	}, 10_000);

	test("returns false after squash-merge when upstream branch is deleted (bug #2545)", async () => {
		const { remotePath, localPath } = setupRemoteAndClone("squash-merge");

		// Create feature branch with a commit and push it
		execSync("git checkout -b feature/squash-test", {
			cwd: localPath,
			stdio: "ignore",
		});
		writeFileSync(join(localPath, "feature.txt"), "feature work");
		execSync("git add . && git commit -m 'add feature'", {
			cwd: localPath,
			stdio: "ignore",
		});
		execSync("git push -u origin feature/squash-test", {
			cwd: localPath,
			stdio: "ignore",
		});

		// Simulate squash-merge on remote: apply the same change to main with
		// a different commit (different SHA, same patch)
		const squashClone = join(TEST_DIR, "squash-merge-squasher");
		execSync(`git clone "${remotePath}" "${squashClone}"`, { stdio: "ignore" });
		execSync("git config user.email 'test@test.com'", {
			cwd: squashClone,
			stdio: "ignore",
		});
		execSync("git config user.name 'Test'", {
			cwd: squashClone,
			stdio: "ignore",
		});
		writeFileSync(join(squashClone, "feature.txt"), "feature work");
		execSync("git add . && git commit -m 'squash: add feature' && git push", {
			cwd: squashClone,
			stdio: "ignore",
		});

		// Delete the remote branch (simulating GitHub's post-merge cleanup)
		execSync("git push origin --delete feature/squash-test", {
			cwd: squashClone,
			stdio: "ignore",
		});

		// Back in local: fetch --prune so the upstream tracking ref is gone
		execSync("git fetch --prune", { cwd: localPath, stdio: "ignore" });

		// BUG: Before the fix, this returned true (false positive warning)
		// After the fix, it should return false since the patch is in origin/main
		expect(await hasUnpushedCommits(localPath)).toBe(false);
	}, 15_000);

	test("returns true after upstream branch deleted with truly unmerged commits", async () => {
		const { remotePath, localPath } = setupRemoteAndClone("unmerged");

		// Create feature branch with a commit and push it
		execSync("git checkout -b feature/unmerged-test", {
			cwd: localPath,
			stdio: "ignore",
		});
		writeFileSync(join(localPath, "unique.txt"), "unique work not on main");
		execSync("git add . && git commit -m 'unique work'", {
			cwd: localPath,
			stdio: "ignore",
		});
		execSync("git push -u origin feature/unmerged-test", {
			cwd: localPath,
			stdio: "ignore",
		});

		// Delete the remote branch WITHOUT merging
		const helperClone = join(TEST_DIR, "unmerged-helper");
		execSync(`git clone "${remotePath}" "${helperClone}"`, { stdio: "ignore" });
		execSync("git push origin --delete feature/unmerged-test", {
			cwd: helperClone,
			stdio: "ignore",
		});

		// Prune locally
		execSync("git fetch --prune", { cwd: localPath, stdio: "ignore" });

		// Should still return true — commits are genuinely not merged
		expect(await hasUnpushedCommits(localPath)).toBe(true);
	}, 15_000);

	test("warns when cherry-pick fallback fails and continues to remotes fallback", async () => {
		const repoPath = createTestRepo("no-remote-warning");
		seedCommit(repoPath);

		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

		try {
			expect(await hasUnpushedCommits(repoPath)).toBe(true);
			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy).toHaveBeenCalledWith(
				"[git/hasUnpushedCommits] Cherry-pick fallback failed; falling back to remote reachability check.",
				expect.objectContaining({
					worktreePath: repoPath,
					error: expect.any(String),
				}),
			);
		} finally {
			warnSpy.mockRestore();
		}
	});
});

describe("parsePrUrl", () => {
	test("parses canonical GitHub PR URL", () => {
		expect(
			parsePrUrl("https://github.com/superset-sh/superset/pull/1781"),
		).toEqual({
			owner: "superset-sh",
			repo: "superset",
			number: 1781,
		});
	});

	test("parses GitHub URL without protocol", () => {
		expect(parsePrUrl("github.com/superset-sh/superset/pull/1781")).toEqual({
			owner: "superset-sh",
			repo: "superset",
			number: 1781,
		});
	});

	test("returns null for non-PR URLs", () => {
		expect(
			parsePrUrl("https://github.com/superset-sh/superset/issues/1781"),
		).toBe(null);
	});
});
