import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import type { ChangedFile } from "../../types";
import { type GitStatusSnapshot, getGitStatusSnapshot } from "../git-status";
import {
	applyStatusPartial,
	getGitStatusPartial,
	shouldRecomputeInFull,
} from "./git-status-partial";

async function initRepo(path: string): Promise<SimpleGit> {
	const git = simpleGit(path);
	await git.init();
	await git.raw(["config", "user.email", "test@example.com"]);
	await git.raw(["config", "user.name", "test"]);
	await git.raw(["config", "commit.gpgsign", "false"]);
	await git.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);
	return git;
}

function normalize(files: ChangedFile[]): ChangedFile[] {
	return [...files]
		.map((f) => ({ ...f }))
		.sort((a, b) => a.path.localeCompare(b.path));
}

async function full(git: SimpleGit, repo: string): Promise<GitStatusSnapshot> {
	const { snapshot } = await getGitStatusSnapshot({ git, worktreePath: repo });
	return snapshot;
}

async function patch(
	git: SimpleGit,
	repo: string,
	snapshot: GitStatusSnapshot,
	paths: string[],
): Promise<{ snapshot: GitStatusSnapshot; escalated: boolean }> {
	const partial = await getGitStatusPartial({
		git,
		worktreePath: repo,
		paths,
	});
	if (shouldRecomputeInFull(snapshot, partial)) {
		return { snapshot: await full(git, repo), escalated: true };
	}
	return { snapshot: applyStatusPartial(snapshot, partial), escalated: false };
}

async function expectMatchesFull(
	git: SimpleGit,
	repo: string,
	snapshot: GitStatusSnapshot,
) {
	const fresh = await full(git, repo);
	expect(normalize(snapshot.unstaged)).toEqual(normalize(fresh.unstaged));
	expect(normalize(snapshot.staged)).toEqual(normalize(fresh.staged));
	expect([...snapshot.ignoredPaths].sort()).toEqual(
		[...fresh.ignoredPaths].sort(),
	);
}

function expectNoDuplicateRows(snapshot: GitStatusSnapshot) {
	const paths = snapshot.unstaged.map((f) => f.path);
	expect(new Set(paths).size).toBe(paths.length);
}

const TEN_LINES = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");

describe("round 2: literal pathspecs", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-partial-adv2-"));
		git = await initRepo(repo);
		await mkdir(join(repo, "src"), { recursive: true });
		await writeFile(join(repo, "src", "a.ts"), `${TEN_LINES}\n`);
		await writeFile(join(repo, "src", "b.ts"), "const b = 2;\n");
		await writeFile(join(repo, ".gitignore"), "node_modules/\n*.log\nbuild/\n");
		await git.add(".");
		await git.commit("init");
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("a directory whose name contains ':(' (looks like pathspec magic) patches cleanly", async () => {
		await mkdir(join(repo, "we:(ird"), { recursive: true });
		await writeFile(join(repo, "we:(ird", "f.ts"), "x\n");
		await git.add(".");
		await git.commit("weird");
		const before = await full(git, repo);
		await writeFile(join(repo, "we:(ird", "f.ts"), "y\n");
		const { snapshot } = await patch(git, repo, before, ["we:(ird/f.ts"]);
		expect(snapshot.unstaged.map((f) => f.path)).toEqual(["we:(ird/f.ts"]);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("a path containing ')' right after the literal prefix still resolves", async () => {
		await mkdir(join(repo, ")paren"), { recursive: true });
		await writeFile(join(repo, ")paren", "f.ts"), "x\n");
		await git.add(".");
		await git.commit("paren");
		const before = await full(git, repo);
		await writeFile(join(repo, ")paren", "f.ts"), "y\n");
		const { snapshot } = await patch(git, repo, before, [")paren/f.ts"]);
		expect(snapshot.unstaged.map((f) => f.path)).toEqual([")paren/f.ts"]);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("an untracked directory named with [ ] expands under literal magic and leaves glob-siblings alone", async () => {
		// `new[dir]` as a glob matches `newd`, `newi`, `newr` — all siblings here.
		await mkdir(join(repo, "newd"), { recursive: true });
		await writeFile(join(repo, "newd", "x.ts"), "sibling\n");
		const before = await full(git, repo);
		expect(before.unstaged.map((f) => f.path)).toEqual(["newd/x.ts"]);

		await mkdir(join(repo, "new[dir]", "sub"), { recursive: true });
		await writeFile(join(repo, "new[dir]", "sub", "f.ts"), "n\n");
		await writeFile(join(repo, "new[dir]", "g.ts"), "n2\n");
		const { snapshot } = await patch(git, repo, before, ["new[dir]"]);
		expectNoDuplicateRows(snapshot);
		expect(snapshot.unstaged.map((f) => f.path).sort()).toEqual([
			"new[dir]/g.ts",
			"new[dir]/sub/f.ts",
			"newd/x.ts",
		]);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("a worktree rename of a bracket-named tracked file is detected in full and survives a patch", async () => {
		await mkdir(join(repo, "app", "[id]"), { recursive: true });
		await writeFile(join(repo, "app", "[id]", "page.tsx"), `${TEN_LINES}\n`);
		await git.add(".");
		await git.commit("route");
		await rename(
			join(repo, "app", "[id]", "page.tsx"),
			join(repo, "app", "[id]", "layout.tsx"),
		);
		const snapshot = await full(git, repo);
		expect(snapshot.unstaged.map((f) => [f.path, f.oldPath, f.status])).toEqual(
			[["app/[id]/layout.tsx", "app/[id]/page.tsx", "renamed"]],
		);
		await writeFile(join(repo, "src", "b.ts"), "edit\n");
		const patched = await patch(git, repo, snapshot, ["src/b.ts"]);
		expect(patched.escalated).toBe(false);
		await expectMatchesFull(git, repo, patched.snapshot);
	});

	test("300 pathspecs across 300 top-level directories in one batch", async () => {
		const dirs = Array.from({ length: 300 }, (_, i) => `d${i}`);
		await Promise.all(
			dirs.map(async (dir) => {
				await mkdir(join(repo, dir), { recursive: true });
				await writeFile(join(repo, dir, "f.ts"), "t\n");
			}),
		);
		await git.add(".");
		await git.commit("many");
		const before = await full(git, repo);
		await Promise.all(
			dirs.map((dir) => writeFile(join(repo, dir, "f.ts"), "changed\n")),
		);
		const { snapshot, escalated } = await patch(
			git,
			repo,
			before,
			dirs.map((dir) => `${dir}/f.ts`),
		);
		expect(escalated).toBe(false);
		expect(snapshot.unstaged).toHaveLength(300);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("a scope that IS a top-level directory with an ignored subdirectory", async () => {
		const before = await full(git, repo);
		await mkdir(join(repo, "src", "build"), { recursive: true });
		await writeFile(join(repo, "src", "build", "out.js"), "o\n");
		await writeFile(join(repo, "src", "b.ts"), "edit\n");
		const { snapshot } = await patch(git, repo, before, ["src"]);
		expect(snapshot.ignoredPaths).toEqual(["src/build"]);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("a './'-prefixed relative path is not normalized: git finds the file but eviction misses it", async () => {
		await writeFile(join(repo, "src", "b.ts"), "edit\n");
		const before = await full(git, repo);
		await writeFile(join(repo, "src", "b.ts"), "edit\nmore\n");
		const { snapshot } = await patch(git, repo, before, ["./src/b.ts"]);
		expectNoDuplicateRows(snapshot);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("'.' as a batch path is dropped rather than replaying the whole tree", async () => {
		await writeFile(join(repo, "src", "b.ts"), "edit\n");
		const before = await full(git, repo);
		await writeFile(join(repo, "src", "a.ts"), "edit\n");
		const partial = await getGitStatusPartial({
			git,
			worktreePath: repo,
			paths: ["."],
		});
		expect(partial.paths).toEqual([]);
		expect(applyStatusPartial(before, partial)).toBe(before);
	});

	test("a trailing slash on a file path makes git report nothing and the stale row survives", async () => {
		await writeFile(join(repo, "src", "b.ts"), "edit\n");
		const before = await full(git, repo);
		await writeFile(join(repo, "src", "b.ts"), "edit\nmore\n");
		const { snapshot } = await patch(git, repo, before, ["src/b.ts/"]);
		await expectMatchesFull(git, repo, snapshot);
	});
});

describe("round 2: toWorktreeRelative", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-partial-adv2-rel-"));
		git = await initRepo(repo);
		await mkdir(join(repo, "src"), { recursive: true });
		await writeFile(join(repo, "src", "a.ts"), "a\n");
		await git.add(".");
		await git.commit("init");
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("a batch that filters to nothing is a no-op, not an eviction", async () => {
		await writeFile(join(repo, "src", "a.ts"), "edit\n");
		const before = await full(git, repo);
		expect(before.unstaged).toHaveLength(1);
		const partial = await getGitStatusPartial({
			git,
			worktreePath: repo,
			paths: ["../escape", "/etc/hosts", "", "a/../../b"],
		});
		expect(partial).toEqual({ paths: [], unstaged: [] });
		const after = applyStatusPartial(before, partial);
		expect(after).toBe(before);
		expect(shouldRecomputeInFull(before, partial)).toBe(false);
	});

	test("an absolute path spelled through the realpath of a symlinked worktree is still applied", async () => {
		const real = await realpath(repo);
		if (real === repo) {
			// No symlink in the way on this machine (Linux /tmp); nothing to prove.
			return;
		}
		await writeFile(join(repo, "src", "a.ts"), "edit\n");
		const before = await full(git, repo);
		await writeFile(join(repo, "src", "a.ts"), "edit\nmore\n");
		const { snapshot } = await patch(git, repo, before, [
			join(real, "src", "a.ts"),
		]);
		expect(snapshot.unstaged.map((f) => [f.path, f.additions])).toEqual([
			["src/a.ts", 2],
		]);
	});

	test("the worktree path given with a trailing slash still relativizes absolute paths", async () => {
		await writeFile(join(repo, "src", "a.ts"), "edit\n");
		const before = await full(git, repo);
		await writeFile(join(repo, "src", "a.ts"), "edit\nmore\n");
		const partial = await getGitStatusPartial({
			git,
			worktreePath: `${repo}/`,
			paths: [join(repo, "src", "a.ts")],
		});
		expect(partial.paths).toEqual(["src/a.ts"]);
		const after = applyStatusPartial(before, partial);
		expectNoDuplicateRows(after);
		expect(after.unstaged.map((f) => f.additions)).toEqual([2]);
	});
});

describe("round 2: scoped ignoredPaths merge", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-partial-adv2-ign-"));
		git = await initRepo(repo);
		await mkdir(join(repo, "src"), { recursive: true });
		await writeFile(join(repo, "src", "a.ts"), "a\n");
		await writeFile(join(repo, ".gitignore"), "node_modules/\n*.log\nbuild/\n");
		await git.add(".");
		await git.commit("init");
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("a sequence of batches over collapsed, nested, top-level, exclude-file and all-ignored entries converges", async () => {
		let snapshot = await full(git, repo);
		expect(snapshot.ignoredPaths).toEqual([]);
		const steps: Array<{ act: () => Promise<void>; paths: string[] }> = [
			{
				act: async () => {
					await mkdir(join(repo, "node_modules", "pkg"), { recursive: true });
					await writeFile(join(repo, "node_modules", "pkg", "i.js"), "n\n");
				},
				paths: ["node_modules/pkg/i.js"],
			},
			{
				act: async () => {
					await mkdir(join(repo, "src", "build"), { recursive: true });
					await writeFile(join(repo, "src", "build", "out.js"), "o\n");
				},
				paths: ["src/build/out.js"],
			},
			{
				act: () => writeFile(join(repo, "top.log"), "l\n"),
				paths: ["top.log"],
			},
			{
				act: async () => {
					await mkdir(join(repo, "gen"), { recursive: true });
					await writeFile(join(repo, "gen", "a.log"), "l\n");
				},
				paths: ["gen/a.log"],
			},
			{
				act: async () => {
					await writeFile(
						join(repo, ".git", "info", "exclude"),
						"secret.txt\n",
					);
					await writeFile(join(repo, "secret.txt"), "s\n");
				},
				paths: ["secret.txt"],
			},
			{
				act: async () => {
					await mkdir(join(repo, "pkg", "build"), { recursive: true });
					await writeFile(join(repo, "pkg", ".gitignore"), "build/\n");
					await writeFile(join(repo, "pkg", "build", "o.js"), "o\n");
					await writeFile(join(repo, "pkg", "index.ts"), "i\n");
				},
				paths: ["pkg/.gitignore", "pkg/build/o.js", "pkg/index.ts"],
			},
			{ act: () => rm(join(repo, "top.log")), paths: ["top.log"] },
			{
				act: () => rm(join(repo, "node_modules"), { recursive: true }),
				paths: ["node_modules"],
			},
			{
				act: () => rm(join(repo, "gen", "a.log")),
				paths: ["gen/a.log"],
			},
			{
				act: () => rm(join(repo, "src", "build"), { recursive: true }),
				paths: ["src/build"],
			},
		];
		for (const step of steps) {
			await step.act();
			({ snapshot } = await patch(git, repo, snapshot, step.paths));
			await expectMatchesFull(git, repo, snapshot);
			expect(new Set(snapshot.ignoredPaths).size).toBe(
				snapshot.ignoredPaths.length,
			);
		}
	});

	test("a non-ASCII top-level ignored directory is evicted when it disappears", async () => {
		await mkdir(join(repo, "café"), { recursive: true });
		await writeFile(join(repo, "café", "a.log"), "l\n");
		let snapshot = await full(git, repo);
		expect(snapshot.ignoredPaths.length).toBeGreaterThan(0);
		await rm(join(repo, "café"), { recursive: true });
		({ snapshot } = await patch(git, repo, snapshot, ["café"]));
		await expectMatchesFull(git, repo, snapshot);
		expect(snapshot.ignoredPaths).toEqual([]);
	});

	test("an escalating partial never contributes its ignoredPaths (full walk wins)", async () => {
		let snapshot = await full(git, repo);
		await writeFile(join(repo, "top.log"), "l\n");
		await rm(join(repo, "src", "a.ts"));
		const partial = await getGitStatusPartial({
			git,
			worktreePath: repo,
			paths: ["top.log", "src/a.ts"],
		});
		expect(partial.ignoredPaths).toEqual(["top.log"]);
		expect(shouldRecomputeInFull(snapshot, partial)).toBe(true);
		snapshot = await full(git, repo);
		expect(snapshot.ignoredPaths).toEqual(["top.log"]);
	});
});

describe("round 2: unstaged oldPath and escalation", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-partial-adv2-ren-"));
		git = await initRepo(repo);
		await mkdir(join(repo, "src"), { recursive: true });
		await writeFile(join(repo, "src", "a.ts"), `${TEN_LINES}\n`);
		await writeFile(join(repo, "src", "b.ts"), "const b = 2;\n");
		await git.add(".");
		await git.commit("init");
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("RM: a staged rename edited afterwards carries no unstaged oldPath and unrelated batches never escalate", async () => {
		await git.raw(["mv", "src/a.ts", "src/moved.ts"]);
		await writeFile(join(repo, "src", "moved.ts"), `${TEN_LINES}\nextra\n`);
		let snapshot = await full(git, repo);
		expect(snapshot.staged.map((f) => [f.path, f.oldPath])).toEqual([
			["src/moved.ts", "src/a.ts"],
		]);
		expect(snapshot.unstaged.map((f) => [f.path, f.oldPath, f.status])).toEqual(
			[["src/moved.ts", undefined, "modified"]],
		);
		await writeFile(join(repo, "src", "b.ts"), "edit\n");
		let escalated: boolean;
		({ snapshot, escalated } = await patch(git, repo, snapshot, ["src/b.ts"]));
		expect(escalated).toBe(false);
		await writeFile(join(repo, "src", "moved.ts"), `${TEN_LINES}\nmore\n`);
		({ snapshot, escalated } = await patch(git, repo, snapshot, [
			"src/moved.ts",
		]));
		expect(escalated).toBe(false);
		// The source side of a staged rename is not an unstaged rename source.
		({ snapshot, escalated } = await patch(git, repo, snapshot, ["src/a.ts"]));
		expect(escalated).toBe(false);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("a snapshot rename's folded deletion is invisible: an exact copy arriving in an unrelated batch re-pairs the rename in full but not in the patch", async () => {
		const content = `${TEN_LINES}\n`;
		await rm(join(repo, "src", "a.ts"));
		// 60% similar: enough to be paired with the deletion.
		await writeFile(
			join(repo, "src", "b1.ts"),
			`${content.replace(/line [0-3]/g, "changed")}`,
		);
		let snapshot = await full(git, repo);
		expect(snapshot.unstaged.map((f) => [f.path, f.oldPath, f.status])).toEqual(
			[["src/b1.ts", "src/a.ts", "renamed"]],
		);
		await writeFile(join(repo, "src", "c.ts"), content);
		({ snapshot } = await patch(git, repo, snapshot, ["src/c.ts"]));
		await expectMatchesFull(git, repo, snapshot);
	});

	test("intent-to-add rename whose similarity flips back within scope is reported as a rename again", async () => {
		const content = `${TEN_LINES}\n`;
		await rm(join(repo, "src", "a.ts"));
		await writeFile(join(repo, "src", "ita.ts"), content);
		await git.raw(["add", "-N", "src/ita.ts"]);
		let snapshot = await full(git, repo);
		expect(snapshot.unstaged.map((f) => [f.path, f.oldPath])).toEqual([
			["src/ita.ts", "src/a.ts"],
		]);
		await writeFile(join(repo, "src", "ita.ts"), "totally different\n");
		const flipped = await patch(git, repo, snapshot, ["src/ita.ts"]);
		expect(flipped.escalated).toBe(true);
		snapshot = flipped.snapshot;
		await expectMatchesFull(git, repo, snapshot);
		await writeFile(join(repo, "src", "ita.ts"), content);
		({ snapshot } = await patch(git, repo, snapshot, ["src/ita.ts"]));
		await expectMatchesFull(git, repo, snapshot);
	});

	test("a copy (status.renames=copies) on the staged side leaves the unstaged side without oldPath", async () => {
		await git.raw(["config", "status.renames", "copies"]);
		await writeFile(join(repo, "src", "copy.ts"), `${TEN_LINES}\n`);
		await writeFile(join(repo, "src", "a.ts"), `${TEN_LINES}\nsource edited\n`);
		await git.add(".");
		const snapshot = await full(git, repo);
		for (const file of snapshot.unstaged) expect(file.oldPath).toBeUndefined();
		await writeFile(join(repo, "src", "copy.ts"), `${TEN_LINES}\nwt\n`);
		const patched = await patch(git, repo, snapshot, ["src/copy.ts"]);
		expect(patched.escalated).toBe(false);
		await expectMatchesFull(git, repo, patched.snapshot);
	});
});
