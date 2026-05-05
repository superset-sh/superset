import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { listGitWorktrees, parseWorktreeList } from "./worktree-list";

describe("parseWorktreeList", () => {
	test("parses a branch worktree", () => {
		const raw = [
			"worktree /repo",
			"HEAD abc123",
			"branch refs/heads/main",
			"",
		].join("\n");
		expect(parseWorktreeList(raw)).toEqual([
			{
				path: "/repo",
				head: "abc123",
				branch: "main",
				detached: false,
				bare: false,
				locked: null,
				prunable: null,
			},
		]);
	});

	test("parses a detached worktree", () => {
		const raw = ["worktree /repo/wt", "HEAD abc123", "detached", ""].join("\n");
		const [record] = parseWorktreeList(raw);
		expect(record).toMatchObject({
			path: "/repo/wt",
			branch: null,
			detached: true,
		});
	});

	test("parses a bare worktree", () => {
		const raw = ["worktree /repo/bare", "bare", ""].join("\n");
		const [record] = parseWorktreeList(raw);
		expect(record).toMatchObject({
			path: "/repo/bare",
			head: null,
			branch: null,
			bare: true,
		});
	});

	test("parses locked and prunable with reasons", () => {
		const raw = [
			"worktree /a",
			"HEAD aaa",
			"branch refs/heads/a",
			"locked manual lock",
			"",
			"worktree /b",
			"HEAD bbb",
			"branch refs/heads/b",
			"prunable gitdir invalid",
			"",
		].join("\n");
		const records = parseWorktreeList(raw);
		expect(records[0]?.locked).toEqual({ reason: "manual lock" });
		expect(records[0]?.prunable).toBeNull();
		expect(records[1]?.prunable).toEqual({ reason: "gitdir invalid" });
		expect(records[1]?.locked).toBeNull();
	});

	test("parses locked/prunable with no reason as empty string", () => {
		const raw = [
			"worktree /a",
			"HEAD aaa",
			"branch refs/heads/a",
			"locked",
			"prunable",
			"",
		].join("\n");
		const [record] = parseWorktreeList(raw);
		expect(record?.locked).toEqual({ reason: "" });
		expect(record?.prunable).toEqual({ reason: "" });
	});

	test("parses multiple records and tolerates missing trailing newline", () => {
		const raw = [
			"worktree /one",
			"HEAD 111",
			"branch refs/heads/one",
			"",
			"worktree /two",
			"HEAD 222",
			"branch refs/heads/feat/two",
		].join("\n");
		const records = parseWorktreeList(raw);
		expect(records).toHaveLength(2);
		expect(records[1]).toMatchObject({ path: "/two", branch: "feat/two" });
	});
});

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

describe("listGitWorktrees", () => {
	let root: string;
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), "superset-list-worktrees-"));
		repo = join(root, "repo");
		mkdirSync(repo);
		git = await initRepo(repo);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test("matches the raw porcelain output's worktree set", async () => {
		await git.raw([
			"worktree",
			"add",
			"-b",
			"feat",
			join(root, "wt-feat"),
			"main",
		]);
		await git.raw([
			"worktree",
			"add",
			"--detach",
			join(root, "wt-detached"),
			"main",
		]);

		const records = await listGitWorktrees(git);
		const raw = await git.raw(["worktree", "list", "--porcelain"]);
		const fromRaw = parseWorktreeList(raw);

		expect(records).toEqual(fromRaw);
		expect(records.map((r) => r.branch).sort()).toEqual(
			[null, "feat", "main"].sort(),
		);
		expect(records.find((r) => r.detached)).toBeDefined();
	});
});
