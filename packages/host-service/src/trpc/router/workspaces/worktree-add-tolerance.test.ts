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
import { createUserSimpleGit } from "../../../runtime/git/simple-git";
import { addBranchWorktree } from "./workspaces";

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-hs-worktree-tolerance-${process.pid}`,
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

function installFailingHook(repoPath: string): void {
	// Real-world shape: streams install output, fails without ever printing
	// "post-checkout" or "husky".
	const hookPath = join(repoPath, ".git", "hooks", "post-checkout");
	writeFileSync(
		hookPath,
		"#!/bin/sh\necho 'Fresh worktree detected - installing dependencies...'\nexit 1\n",
	);
	execSync(`chmod +x "${hookPath}"`);
}

describe("addBranchWorktree hook tolerance", () => {
	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("new branch: continues when post-checkout hook fails but worktree is created", async () => {
		const repoPath = createTestRepo("new-branch-hook-fail");
		installFailingHook(repoPath);
		const git = createUserSimpleGit(repoPath);
		const worktreePath = join(TEST_DIR, "new-branch-hook-fail-wt");

		await addBranchWorktree({
			git,
			plan: {
				branch: "feature/hook-fail",
				startPoint: {
					kind: "local",
					fullRef: "refs/heads/main",
					shortName: "main",
				},
				usedExistingBranch: false,
			},
			worktreePath,
			sparsePaths: [],
		});

		expect(existsSync(worktreePath)).toBe(true);
		const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
			cwd: worktreePath,
		})
			.toString()
			.trim();
		expect(currentBranch).toBe("feature/hook-fail");
	}, 15_000);

	test("existing branch: continues when post-checkout hook fails but worktree is created", async () => {
		const repoPath = createTestRepo("existing-branch-hook-fail");
		execSync("git branch feature/existing", { cwd: repoPath, stdio: "ignore" });
		installFailingHook(repoPath);
		const git = createUserSimpleGit(repoPath);
		const worktreePath = join(TEST_DIR, "existing-branch-hook-fail-wt");

		await addBranchWorktree({
			git,
			plan: {
				branch: "feature/existing",
				startPoint: {
					kind: "local",
					fullRef: "refs/heads/feature/existing",
					shortName: "feature/existing",
				},
				usedExistingBranch: true,
			},
			worktreePath,
			sparsePaths: [],
		});

		expect(existsSync(worktreePath)).toBe(true);
		const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
			cwd: worktreePath,
		})
			.toString()
			.trim();
		expect(currentBranch).toBe("feature/existing");
	}, 15_000);

	test("throws on an invalid start point even when a hook exists", async () => {
		const repoPath = createTestRepo("bad-start");
		installFailingHook(repoPath);
		const git = createUserSimpleGit(repoPath);
		const worktreePath = join(TEST_DIR, "bad-start-wt");

		await expect(
			addBranchWorktree({
				git,
				plan: {
					branch: "feature/bad-start",
					startPoint: {
						kind: "local",
						fullRef: "refs/heads/does-not-exist",
						shortName: "does-not-exist",
					},
					usedExistingBranch: false,
				},
				worktreePath,
				sparsePaths: [],
			}),
		).rejects.toThrow();
		expect(existsSync(worktreePath)).toBe(false);
	}, 15_000);
});
