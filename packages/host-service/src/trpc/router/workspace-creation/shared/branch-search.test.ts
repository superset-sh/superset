import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { findWorktreeAtPath, getWorktreeBranchAtPath } from "./branch-search";

async function initRepo(path: string): Promise<SimpleGit> {
	const git = simpleGit(path);
	await git.init();
	await git.raw(["config", "user.email", "test@example.com"]);
	await git.raw(["config", "user.name", "test"]);
	await git.raw(["config", "commit.gpgsign", "false"]);
	await git.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);
	await writeFile(join(path, "README.md"), "test\n");
	await git.raw(["add", "README.md"]);
	await git.raw(["commit", "-m", "initial"]);
	return git;
}

describe("worktree branch lookup", () => {
	let root: string;
	let repo: string;
	let worktreePath: string;
	let git: SimpleGit;

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), "superset-worktree-branch-"));
		repo = join(root, "repo");
		worktreePath = join(root, "worktree");
		mkdirSync(repo);
		git = await initRepo(repo);
		await git.raw(["worktree", "add", "-b", "original", worktreePath, "main"]);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test("reads the branch currently checked out at a worktree path", async () => {
		const worktreeGit = simpleGit(worktreePath);
		await worktreeGit.raw(["checkout", "-b", "renamed"]);

		await expect(getWorktreeBranchAtPath(git, worktreePath)).resolves.toBe(
			"renamed",
		);
		await expect(
			findWorktreeAtPath(git, worktreePath, "original"),
		).resolves.toBe(false);
		await expect(
			findWorktreeAtPath(git, worktreePath, "renamed"),
		).resolves.toBe(true);
	});
});
