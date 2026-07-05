import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import {
	findWorktreeAtPath,
	getWorktreeBranchAtPath,
	listWorktreeBranches,
} from "./branch-search";

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

// Parses `git worktree list --porcelain` into (branch -> path) pairs so the
// tests can assert against git's own view of reality. Skips entries with no
// `branch refs/heads/...` line (detached HEAD).
function parsePorcelain(raw: string): Map<string, string> {
	const out = new Map<string, string>();
	let currentPath: string | null = null;
	for (const line of raw.split("\n")) {
		if (line.startsWith("worktree ")) {
			currentPath = line.slice("worktree ".length).trim();
		} else if (line.startsWith("branch refs/heads/") && currentPath) {
			const branch = line.slice("branch refs/heads/".length).trim();
			if (branch) out.set(branch, currentPath);
		} else if (line === "") {
			currentPath = null;
		}
	}
	return out;
}

describe("listWorktreeBranches vs raw git worktree list", () => {
	let root: string;
	let repo: string;
	let managedRoot: string;
	let foreignRoot: string;
	let git: SimpleGit;

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), "superset-collect-worktrees-"));
		repo = join(root, "repo");
		managedRoot = join(root, "managed", "project-id");
		foreignRoot = join(root, "elsewhere");
		mkdirSync(repo);
		mkdirSync(managedRoot, { recursive: true });
		mkdirSync(foreignRoot, { recursive: true });
		git = await initRepo(repo);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test("includes every branch git worktree list reports", async () => {
		await git.raw([
			"worktree",
			"add",
			"-b",
			"managed-feat",
			join(managedRoot, "managed-feat"),
			"main",
		]);
		await git.raw([
			"worktree",
			"add",
			"-b",
			"foreign-feat",
			join(foreignRoot, "foreign-feat"),
			"main",
		]);

		const raw = await git.raw(["worktree", "list", "--porcelain"]);
		const fromGit = parsePorcelain(raw);
		const { worktreeMap, checkedOutBranches } = await listWorktreeBranches(git);

		// Sanity: git itself sees all three branches (main + both worktrees).
		expect([...fromGit.keys()].sort()).toEqual(
			["foreign-feat", "main", "managed-feat"].sort(),
		);

		expect([...checkedOutBranches].sort()).toEqual(
			["foreign-feat", "main", "managed-feat"].sort(),
		);

		// Compare full entries, not just keys — a regression that mangled
		// the path while preserving the branch name would otherwise pass.
		const sortEntries = (m: Map<string, string>) =>
			[...m.entries()].sort(([a], [b]) => a.localeCompare(b));
		expect(sortEntries(worktreeMap)).toEqual(sortEntries(fromGit));
	});
});
