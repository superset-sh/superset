import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { getGitStatusSnapshot } from "./git-status";

/**
 * Integration tests for the status snapshot against real on-disk repos.
 *
 * The untracked-mode assertions guard a performance contract: `-uall` makes
 * git skip `core.untrackedCache` entirely and re-walk the whole worktree on
 * every refresh, so the snapshot must ask for `normal` and expand collapsed
 * directories itself.
 */

async function initRepo(path: string): Promise<SimpleGit> {
	const git = simpleGit(path);
	await git.init();
	await git.raw(["config", "user.email", "test@example.com"]);
	await git.raw(["config", "user.name", "test"]);
	await git.raw(["config", "commit.gpgsign", "false"]);
	await git.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);
	return git;
}

/**
 * Resolve the untracked mode git would actually apply: later flags win, and
 * simple-git hardcodes a bare `-u` (= `all`) before any custom args.
 */
function resolveUntrackedMode(args: string[]): string | null {
	let mode: string | null = null;
	for (const arg of args) {
		if (arg === "-u" || arg === "--untracked-files") mode = "all";
		else if (arg.startsWith("--untracked-files="))
			mode = arg.slice("--untracked-files=".length);
		else if (/^-u[a-z]+$/.test(arg)) mode = arg.slice(2);
	}
	return mode;
}

describe("getGitStatusSnapshot (integration)", () => {
	let repo: string;
	let git: SimpleGit;
	let invocations: string[][];

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-git-status-"));
		git = await initRepo(repo);
		await writeFile(join(repo, "README.md"), "hello\n");
		await git.raw(["add", "--", "README.md"]);
		await git.raw(["commit", "-m", "initial"]);

		invocations = [];
		git.outputHandler((_command, _stdout, _stderr, args) => {
			invocations.push(args);
		});
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	function statusInvocation(): string[] {
		const args = invocations.find((entry) => entry[0] === "status");
		if (!args) throw new Error("no `git status` invocation recorded");
		return args;
	}

	test("asks git for untracked-files=normal so the untracked cache stays live", async () => {
		await getGitStatusSnapshot({ git, worktreePath: repo });

		// `all` is what defeats core.untrackedCache — git only consults the
		// cache in `normal` mode.
		expect(resolveUntrackedMode(statusInvocation())).toBe("normal");
	});

	test("lists every file inside a wholly-untracked directory", async () => {
		await mkdir(join(repo, "newdir", "sub"), { recursive: true });
		await writeFile(join(repo, "newdir", "a.txt"), "a\n");
		await writeFile(join(repo, "newdir", "sub", "b.txt"), "b\n");
		await writeFile(join(repo, "loose.txt"), "c\n");

		const { snapshot } = await getGitStatusSnapshot({
			git,
			worktreePath: repo,
		});

		const untracked = snapshot.unstaged
			.filter((file) => file.status === "untracked")
			.map((file) => file.path)
			.sort();

		// `-unormal` collapses `newdir/` into one entry; the snapshot has to
		// expand it back or the Changes panel loses the individual files.
		expect(untracked).toEqual([
			"loose.txt",
			"newdir/a.txt",
			"newdir/sub/b.txt",
		]);
	});

	test("counts lines for files expanded out of an untracked directory", async () => {
		await mkdir(join(repo, "newdir"), { recursive: true });
		await writeFile(join(repo, "newdir", "a.txt"), "one\ntwo\nthree\n");

		const { snapshot } = await getGitStatusSnapshot({
			git,
			worktreePath: repo,
		});

		const file = snapshot.unstaged.find(
			(entry) => entry.path === "newdir/a.txt",
		);
		expect(file).toBeDefined();
		expect(file?.additions).toBe(3);
	});

	test("honours nested .gitignore when expanding an untracked directory", async () => {
		await mkdir(join(repo, "newdir"), { recursive: true });
		await writeFile(join(repo, "newdir", ".gitignore"), "skipped.txt\n");
		await writeFile(join(repo, "newdir", "kept.txt"), "kept\n");
		await writeFile(join(repo, "newdir", "skipped.txt"), "skipped\n");

		const { snapshot } = await getGitStatusSnapshot({
			git,
			worktreePath: repo,
		});

		const untracked = snapshot.unstaged
			.filter((file) => file.status === "untracked")
			.map((file) => file.path)
			.sort();

		expect(untracked).toEqual(["newdir/.gitignore", "newdir/kept.txt"]);
	});

	test("reports the same untracked set as -uall would", async () => {
		await writeFile(join(repo, ".gitignore"), "ignored/\n*.log\n");
		await mkdir(join(repo, "ignored"), { recursive: true });
		await writeFile(join(repo, "ignored", "junk.txt"), "junk\n");
		await mkdir(join(repo, "a", "b", "c"), { recursive: true });
		await writeFile(join(repo, "a", "b", "c", "deep.txt"), "deep\n");
		await writeFile(join(repo, "a", "top.txt"), "top\n");
		await writeFile(join(repo, "a", "noisy.log"), "noise\n");
		await writeFile(join(repo, "with space.txt"), "space\n");

		const { snapshot } = await getGitStatusSnapshot({
			git,
			worktreePath: repo,
		});
		const actual = snapshot.unstaged
			.filter((file) => file.status === "untracked")
			.map((file) => file.path)
			.sort();

		const porcelain = await simpleGit(repo).raw([
			"status",
			"--porcelain",
			"-z",
			"--untracked-files=all",
		]);
		const expected = porcelain
			.split("\0")
			.filter((line) => line.startsWith("?? "))
			.map((line) => line.slice(3))
			.sort();

		expect(expected.length).toBeGreaterThan(0);
		expect(actual).toEqual(expected);
	});

	test("keeps tracked-file statuses alongside untracked expansion", async () => {
		await writeFile(join(repo, "README.md"), "hello\nworld\n");
		await mkdir(join(repo, "newdir"), { recursive: true });
		await writeFile(join(repo, "newdir", "a.txt"), "a\n");

		const { snapshot } = await getGitStatusSnapshot({
			git,
			worktreePath: repo,
		});

		expect(
			snapshot.unstaged.find((file) => file.path === "README.md")?.status,
		).toBe("modified");
		expect(
			snapshot.unstaged.find((file) => file.path === "newdir/a.txt")?.status,
		).toBe("untracked");
	});
});
