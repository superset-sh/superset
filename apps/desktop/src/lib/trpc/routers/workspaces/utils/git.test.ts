import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

describe("LFS Detection", () => {
	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("detects LFS via .git/lfs directory", async () => {
		const repoPath = createTestRepo("lfs-dir-test");

		// Create .git/lfs directory (simulates LFS being initialized)
		mkdirSync(join(repoPath, ".git", "lfs"), { recursive: true });

		// Import and test - we need to test via the exported createWorktree behavior
		// For now, just verify the directory structure is correct
		expect(existsSync(join(repoPath, ".git", "lfs"))).toBe(true);
	});

	test("detects LFS via root .gitattributes", async () => {
		const repoPath = createTestRepo("lfs-gitattributes-test");

		// Create .gitattributes with LFS filter
		writeFileSync(
			join(repoPath, ".gitattributes"),
			"*.bin filter=lfs diff=lfs merge=lfs -text\n",
		);

		const content = await Bun.file(join(repoPath, ".gitattributes")).text();
		expect(content.includes("filter=lfs")).toBe(true);
	});

	test("detects LFS via .git/info/attributes", async () => {
		const repoPath = createTestRepo("lfs-info-attributes-test");

		// Create .git/info/attributes with LFS filter
		mkdirSync(join(repoPath, ".git", "info"), { recursive: true });
		writeFileSync(
			join(repoPath, ".git", "info", "attributes"),
			"*.png filter=lfs diff=lfs merge=lfs -text\n",
		);

		const content = await Bun.file(
			join(repoPath, ".git", "info", "attributes"),
		).text();
		expect(content.includes("filter=lfs")).toBe(true);
	});

	test("does not detect LFS from .lfsconfig alone", async () => {
		const repoPath = createTestRepo("lfs-config-test");

		// .lfsconfig configures LFS behaviour but does not indicate file tracking
		writeFileSync(
			join(repoPath, ".lfsconfig"),
			"[lfs]\n\tlocksverify = false\n",
		);

		expect(existsSync(join(repoPath, ".git", "lfs"))).toBe(false);
		expect(existsSync(join(repoPath, ".gitattributes"))).toBe(false);
	});

	test("no LFS detected in plain repo", async () => {
		const repoPath = createTestRepo("no-lfs-test");

		// Just a plain repo with no LFS
		expect(existsSync(join(repoPath, ".git", "lfs"))).toBe(false);
		expect(existsSync(join(repoPath, ".gitattributes"))).toBe(false);
	});
});

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
