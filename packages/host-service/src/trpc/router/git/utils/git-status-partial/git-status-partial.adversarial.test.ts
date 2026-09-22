import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import type { ChangedFile } from "../../types";
import { type GitStatusSnapshot, getGitStatusSnapshot } from "../git-status";
import {
	applyStatusPartial,
	coalescePaths,
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

/** Every section a partial can or must not touch, compared to a fresh walk. */
async function expectMatchesFull(
	git: SimpleGit,
	repo: string,
	snapshot: GitStatusSnapshot,
) {
	const fresh = await full(git, repo);
	expect(normalize(snapshot.unstaged)).toEqual(normalize(fresh.unstaged));
	expect(normalize(snapshot.staged)).toEqual(normalize(fresh.staged));
	expect(normalize(snapshot.againstBase)).toEqual(normalize(fresh.againstBase));
	expect([...snapshot.ignoredPaths].sort()).toEqual(
		[...fresh.ignoredPaths].sort(),
	);
}

async function writeMany(dir: string, count: number, prefix = "f") {
	await mkdir(dir, { recursive: true });
	const chunk = 500;
	for (let start = 0; start < count; start += chunk) {
		await Promise.all(
			Array.from({ length: Math.min(chunk, count - start) }, (_, i) =>
				writeFile(join(dir, `${prefix}-${start + i}.txt`), "x\n"),
			),
		);
	}
}

describe("getGitStatusPartial: pathspec and naming edge cases", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-partial-adv-"));
		git = await initRepo(repo);
		await writeFile(join(repo, "README.md"), "hello\nworld\n");
		await mkdir(join(repo, "src"), { recursive: true });
		await writeFile(join(repo, "src", "a.ts"), "const a = 1;\n");
		await writeFile(join(repo, "src", "b.ts"), "const b = 2;\n");
		await git.add(".");
		await git.commit("init");
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("a Next.js-style [id] route path does not pull sibling entries into the patch", async () => {
		await mkdir(join(repo, "app", "[id]"), { recursive: true });
		await mkdir(join(repo, "app", "i"), { recursive: true });
		await writeFile(join(repo, "app", "[id]", "page.tsx"), "dyn\n");
		await writeFile(join(repo, "app", "i", "page.tsx"), "lit\n");
		await git.add(".");
		await git.commit("routes");

		// Both modified; the snapshot already carries app/i/page.tsx.
		await writeFile(join(repo, "app", "i", "page.tsx"), "lit\nedit\n");
		const before = await full(git, repo);
		expect(before.unstaged.map((f) => f.path)).toEqual(["app/i/page.tsx"]);

		await writeFile(join(repo, "app", "[id]", "page.tsx"), "dyn\nedit\n");
		const partial = await getGitStatusPartial({
			git,
			worktreePath: repo,
			paths: ["app/[id]/page.tsx"],
		});
		// The scoped read must only report what it was asked about.
		expect(partial.unstaged.map((f) => f.path)).toEqual(["app/[id]/page.tsx"]);

		const { snapshot } = await patch(git, repo, before, ["app/[id]/page.tsx"]);
		const paths = snapshot.unstaged.map((f) => f.path);
		expect(new Set(paths).size).toBe(paths.length);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("[id] over-match consequence: the sibling already in the snapshot is not duplicated", async () => {
		await mkdir(join(repo, "app", "[id]"), { recursive: true });
		await mkdir(join(repo, "app", "i"), { recursive: true });
		await writeFile(join(repo, "app", "[id]", "page.tsx"), "dyn\n");
		await writeFile(join(repo, "app", "i", "page.tsx"), "lit\n");
		await git.add(".");
		await git.commit("routes");
		await writeFile(join(repo, "app", "i", "page.tsx"), "lit\nedit\n");
		const before = await full(git, repo);

		await writeFile(join(repo, "app", "[id]", "page.tsx"), "dyn\nedit\n");
		const { snapshot } = await patch(git, repo, before, ["app/[id]/page.tsx"]);
		const siblings = snapshot.unstaged.filter(
			(f) => f.path === "app/i/page.tsx",
		);
		expect(siblings).toHaveLength(1);
	});

	test("* and ? in a filename do not widen the scope", async () => {
		await writeFile(join(repo, "src", "star*.ts"), "s\n");
		await writeFile(join(repo, "src", "starfish.ts"), "sf\n");
		await writeFile(join(repo, "src", "q?.ts"), "q\n");
		await writeFile(join(repo, "src", "qa.ts"), "qa\n");
		await git.add(".");
		await git.commit("globby");
		await writeFile(join(repo, "src", "starfish.ts"), "sf\nedit\n");
		await writeFile(join(repo, "src", "qa.ts"), "qa\nedit\n");
		const before = await full(git, repo);

		await writeFile(join(repo, "src", "star*.ts"), "s\nedit\n");
		await writeFile(join(repo, "src", "q?.ts"), "q\nedit\n");
		const partial = await getGitStatusPartial({
			git,
			worktreePath: repo,
			paths: ["src/star*.ts", "src/q?.ts"],
		});
		expect(partial.unstaged.map((f) => f.path).sort()).toEqual([
			"src/q?.ts",
			"src/star*.ts",
		]);

		const { snapshot } = await patch(git, repo, before, [
			"src/star*.ts",
			"src/q?.ts",
		]);
		const paths = snapshot.unstaged.map((f) => f.path);
		expect(new Set(paths).size).toBe(paths.length);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("spaces, quotes, leading dash, unicode and a 255-byte name all patch cleanly", async () => {
		const names = [
			"with space.ts",
			`it's "quoted".ts`,
			"-leading-dash.ts",
			"日本語ファイル.ts",
			"emoji-🚀.ts",
			`${"x".repeat(252)}.ts`,
		];
		for (const name of names) {
			await writeFile(join(repo, "src", name), "one\n");
		}
		await git.add(".");
		await git.commit("names");
		const before = await full(git, repo);
		expect(before.unstaged).toEqual([]);

		for (const name of names) {
			await writeFile(join(repo, "src", name), "one\ntwo\n");
		}
		const { snapshot, escalated } = await patch(
			git,
			repo,
			before,
			names.map((n) => `src/${n}`),
		);
		expect(escalated).toBe(false);
		expect(snapshot.unstaged.map((f) => f.path).sort()).toEqual(
			names.map((n) => `src/${n}`).sort(),
		);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("a path with a leading colon (pathspec magic prefix) is still found", async () => {
		await writeFile(join(repo, "src", ":colon.ts"), "c\n");
		await git.add(".");
		await git.commit("colon");
		const before = await full(git, repo);
		await writeFile(join(repo, "src", ":colon.ts"), "c\nedit\n");
		const { snapshot } = await patch(git, repo, before, ["src/:colon.ts"]);
		await expectMatchesFull(git, repo, snapshot);
		expect(snapshot.unstaged.map((f) => f.path)).toEqual(["src/:colon.ts"]);
	});

	test("a directory that is a string prefix of another is scoped independently", async () => {
		await mkdir(join(repo, "src2"), { recursive: true });
		await writeFile(join(repo, "src2", "z.ts"), "z\n");
		await git.add(".");
		await git.commit("src2");
		await writeFile(join(repo, "src2", "z.ts"), "z\nedit\n");
		const before = await full(git, repo);

		await writeFile(join(repo, "src", "a.ts"), "edit\n");
		const { snapshot } = await patch(git, repo, before, ["src"]);
		await expectMatchesFull(git, repo, snapshot);
		expect(snapshot.unstaged.map((f) => f.path).sort()).toEqual([
			"src/a.ts",
			"src2/z.ts",
		]);
	});

	test("a batch mixing a directory and files inside it coalesces and patches", async () => {
		const before = await full(git, repo);
		await writeFile(join(repo, "src", "a.ts"), "edit\n");
		await writeFile(join(repo, "src", "n.ts"), "new\n");
		const { snapshot } = await patch(git, repo, before, [
			"src/a.ts",
			"src",
			"src/n.ts",
			"src/",
		]);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("an empty batch is a no-op", async () => {
		const partial = await getGitStatusPartial({
			git,
			worktreePath: repo,
			paths: [],
		});
		expect(partial).toEqual({ paths: [], unstaged: [] });
	});

	test("a path under .git/ is harmless", async () => {
		const before = await full(git, repo);
		const { snapshot } = await patch(git, repo, before, [".git/index"]);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("a ../outside path is dropped instead of poisoning the batch", async () => {
		await writeFile(join(repo, "src", "a.ts"), "edit\n");
		const partial = await getGitStatusPartial({
			git,
			worktreePath: repo,
			paths: ["../outside", "src/a.ts"],
		});
		expect(partial.paths).toEqual(["src/a.ts"]);
		expect(partial.unstaged.map((f) => f.path)).toEqual(["src/a.ts"]);
	});

	test("an absolute path inside the repo does not cover the relative entry git reports", async () => {
		await writeFile(join(repo, "src", "a.ts"), "edit\n");
		const before = await full(git, repo);
		await writeFile(join(repo, "src", "a.ts"), "edit\nmore\n");
		const { snapshot } = await patch(git, repo, before, [
			join(repo, "src", "a.ts"),
		]);
		const paths = snapshot.unstaged.map((f) => f.path);
		expect(new Set(paths).size).toBe(paths.length);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("coalescePaths keeps a glob-looking sibling apart from the literal directory", () => {
		expect(coalescePaths(["app/[id]", "app/[id]/page.tsx", "app/i"])).toEqual([
			"app/[id]",
			"app/i",
		]);
	});
});

describe("getGitStatusPartial: filesystem shapes", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-partial-adv-"));
		git = await initRepo(repo);
		await writeFile(join(repo, "README.md"), "hello\nworld\n");
		await mkdir(join(repo, "src"), { recursive: true });
		await writeFile(join(repo, "src", "a.ts"), "const a = 1;\n");
		await writeFile(join(repo, "src", "b.ts"), "const b = 2;\n");
		await git.add(".");
		await git.commit("init");
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("deleting a directory of tracked files escalates and matches", async () => {
		const before = await full(git, repo);
		await rm(join(repo, "src"), { recursive: true });
		const { snapshot, escalated } = await patch(git, repo, before, ["src"]);
		expect(escalated).toBe(true);
		await expectMatchesFull(git, repo, snapshot);
	});

	// Index mutations reach production as a `.git/` watcher event, which is a
	// broad invalidation; only the unstaged section is the partial's contract.
	test("an untracked directory becoming tracked drops its untracked entries", async () => {
		await mkdir(join(repo, "fresh"), { recursive: true });
		await writeFile(join(repo, "fresh", "one.ts"), "a\n");
		await writeFile(join(repo, "fresh", "two.ts"), "b\n");
		const before = await full(git, repo);
		expect(before.unstaged.map((f) => f.status)).toEqual([
			"untracked",
			"untracked",
		]);
		await git.add("fresh");
		const { snapshot } = await patch(git, repo, before, ["fresh"]);
		expect(normalize(snapshot.unstaged)).toEqual(
			normalize((await full(git, repo)).unstaged),
		);
		expect(snapshot.unstaged).toEqual([]);
	});

	test("a tracked directory becoming untracked (rm --cached) matches unstaged", async () => {
		const before = await full(git, repo);
		await git.raw(["rm", "--cached", "-r", "src"]);
		const { snapshot } = await patch(git, repo, before, ["src"]);
		expect(normalize(snapshot.unstaged)).toEqual(
			normalize((await full(git, repo)).unstaged),
		);
		expect(
			snapshot.unstaged.map((f) => [f.path, f.status, f.additions]),
		).toEqual([
			["src/a.ts", "untracked", 1],
			["src/b.ts", "untracked", 1],
		]);
	});

	test("a file replaced by a directory of the same name matches", async () => {
		const before = await full(git, repo);
		await rm(join(repo, "src", "a.ts"));
		await mkdir(join(repo, "src", "a.ts"));
		await writeFile(join(repo, "src", "a.ts", "inner.ts"), "in\n");
		const { snapshot } = await patch(git, repo, before, ["src/a.ts"]);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("untracked symlinks: outside stays null, inside counts the target", async () => {
		const before = await full(git, repo);
		await symlink("/etc/hosts", join(repo, "src", "outside.link"));
		await symlink("a.ts", join(repo, "src", "inside.link"));
		const { snapshot } = await patch(git, repo, before, [
			"src/outside.link",
			"src/inside.link",
		]);
		await expectMatchesFull(git, repo, snapshot);
		const outside = snapshot.unstaged.find(
			(f) => f.path === "src/outside.link",
		);
		const inside = snapshot.unstaged.find((f) => f.path === "src/inside.link");
		expect([outside?.additions, outside?.deletions]).toEqual([null, null]);
		expect([inside?.additions, inside?.deletions]).toEqual([1, 0]);
	});

	test("an untracked binary and an over-budget file match the full walk", async () => {
		const before = await full(git, repo);
		await writeFile(
			join(repo, "src", "blob.bin"),
			Buffer.from([0x00, 0x01, 0x02, 0x0a, 0x00]),
		);
		await writeFile(
			join(repo, "src", "huge.txt"),
			`${"line\n".repeat(220_000)}`,
		);
		const { snapshot } = await patch(git, repo, before, [
			"src/blob.bin",
			"src/huge.txt",
		]);
		await expectMatchesFull(git, repo, snapshot);
		const blob = snapshot.unstaged.find((f) => f.path === "src/blob.bin");
		const huge = snapshot.unstaged.find((f) => f.path === "src/huge.txt");
		expect([blob?.additions, blob?.deletions, blob?.isBinary]).toEqual([
			0,
			0,
			true,
		]);
		expect([huge?.additions, huge?.deletions]).toEqual([null, null]);
	});

	test("a modified tracked binary is flagged the same way by partial and full", async () => {
		await writeFile(join(repo, "src", "img.bin"), Buffer.from([0, 1, 2, 3]));
		await git.add(".");
		await git.commit("bin");
		const before = await full(git, repo);
		await writeFile(join(repo, "src", "img.bin"), Buffer.from([0, 9, 9, 9, 9]));
		const { snapshot } = await patch(git, repo, before, ["src/img.bin"]);
		await expectMatchesFull(git, repo, snapshot);
		expect(snapshot.unstaged[0]?.isBinary).toBe(true);
	});

	test("a nested untracked dir honours a nested .gitignore in both paths", async () => {
		const before = await full(git, repo);
		await mkdir(join(repo, "pkg", "build"), { recursive: true });
		await writeFile(join(repo, "pkg", ".gitignore"), "build/\n");
		await writeFile(join(repo, "pkg", "index.ts"), "i\n");
		await writeFile(join(repo, "pkg", "build", "out.js"), "o\n");
		const { snapshot } = await patch(git, repo, before, ["pkg"]);
		await expectMatchesFull(git, repo, snapshot);
		expect(snapshot.unstaged.map((f) => f.path).sort()).toEqual([
			"pkg/.gitignore",
			"pkg/index.ts",
		]);
	});

	test("a new top-level ignored file appears in ignoredPaths after a partial", async () => {
		await writeFile(join(repo, ".gitignore"), "*.log\n");
		await git.add(".");
		await git.commit("ignore");
		const before = await full(git, repo);
		expect(before.ignoredPaths).toEqual([]);
		await writeFile(join(repo, "debug.log"), "noise\n");
		const { snapshot } = await patch(git, repo, before, ["debug.log"]);
		expect(snapshot.unstaged).toEqual([]);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("5,001 untracked files in one batch: partial and full both skip counts, in bounded time", async () => {
		const before = await full(git, repo);
		await writeMany(join(repo, "gen"), 5_001);
		const t0 = performance.now();
		const partial = await getGitStatusPartial({
			git,
			worktreePath: repo,
			paths: ["gen"],
		});
		const partialMs = performance.now() - t0;
		expect(partial.unstaged).toHaveLength(5_001);
		expect(partial.unstaged.every((f) => f.additions === null)).toBe(true);

		const t1 = performance.now();
		const fresh = await full(git, repo);
		const fullMs = performance.now() - t1;
		expect(fresh.unstaged.every((f) => f.additions === null)).toBe(true);
		console.info(
			`[timing] 5,001 untracked: partial ${partialMs.toFixed(0)}ms, full ${fullMs.toFixed(0)}ms`,
		);

		expect(shouldRecomputeInFull(before, partial)).toBe(false);
		const patched = applyStatusPartial(before, partial);
		await expectMatchesFull(git, repo, patched);
	}, 60_000);

	test("exactly 5,000 untracked files in a batch are still counted", async () => {
		const before = await full(git, repo);
		await writeMany(join(repo, "gen"), 5_000);
		const { snapshot } = await patch(git, repo, before, ["gen"]);
		expect(snapshot.unstaged).toHaveLength(5_000);
		expect(snapshot.unstaged.every((f) => f.additions === 1)).toBe(true);
		await expectMatchesFull(git, repo, snapshot);
	}, 60_000);

	test("a small batch on top of a >5,000-untracked snapshot counts only its own files", async () => {
		await writeMany(join(repo, "gen"), 5_001);
		const before = await full(git, repo);
		expect(before.unstaged.every((f) => f.additions === null)).toBe(true);
		await writeFile(join(repo, "src", "new.ts"), "one\ntwo\n");
		const { snapshot } = await patch(git, repo, before, ["src/new.ts"]);
		const entry = snapshot.unstaged.find((f) => f.path === "src/new.ts");
		// Partial counted it (2); a full walk would leave it null. Divergence by design?
		expect(entry?.additions).toBe(2);
		const fresh = await full(git, repo);
		expect(fresh.unstaged.find((f) => f.path === "src/new.ts")?.additions).toBe(
			null,
		);
	}, 60_000);
});

describe("getGitStatusPartial: renames and index interplay", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-partial-adv-"));
		git = await initRepo(repo);
		await writeFile(join(repo, "README.md"), "hello\nworld\n");
		await mkdir(join(repo, "src"), { recursive: true });
		await writeFile(
			join(repo, "src", "a.ts"),
			`${Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n")}\n`,
		);
		await writeFile(join(repo, "src", "b.ts"), "const b = 2;\n");
		await git.add(".");
		await git.commit("init");
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("rename then rename back converges to clean", async () => {
		await rename(join(repo, "src", "a.ts"), join(repo, "src", "moved.ts"));
		let snapshot = await full(git, repo);
		expect(snapshot.unstaged.map((f) => f.status)).toEqual(["renamed"]);
		await rename(join(repo, "src", "moved.ts"), join(repo, "src", "a.ts"));
		({ snapshot } = await patch(git, repo, snapshot, [
			"src/moved.ts",
			"src/a.ts",
		]));
		expect(snapshot.unstaged).toEqual([]);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("rename back reported via only the destination side still escalates", async () => {
		await rename(join(repo, "src", "a.ts"), join(repo, "src", "moved.ts"));
		let snapshot = await full(git, repo);
		await rename(join(repo, "src", "moved.ts"), join(repo, "src", "a.ts"));
		const result = await patch(git, repo, snapshot, ["src/a.ts"]);
		snapshot = result.snapshot;
		expect(result.escalated).toBe(true);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("rename A->B plus a fresh copy C with the same content matches", async () => {
		const before = await full(git, repo);
		const content = await Bun.file(join(repo, "src", "a.ts")).text();
		await rename(join(repo, "src", "a.ts"), join(repo, "src", "B.ts"));
		await writeFile(join(repo, "src", "C.ts"), content);
		const { snapshot } = await patch(git, repo, before, [
			"src/a.ts",
			"src/B.ts",
			"src/C.ts",
		]);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("rename with edits below and above the similarity threshold matches", async () => {
		const before = await full(git, repo);
		const content = await Bun.file(join(repo, "src", "a.ts")).text();
		await rm(join(repo, "src", "a.ts"));
		await writeFile(join(repo, "src", "similar.ts"), `${content}extra\n`);
		let { snapshot } = await patch(git, repo, before, [
			"src/a.ts",
			"src/similar.ts",
		]);
		await expectMatchesFull(git, repo, snapshot);
		expect(snapshot.unstaged.map((f) => f.status)).toEqual(["renamed"]);

		await writeFile(join(repo, "src", "similar.ts"), "totally\ndifferent\n");
		({ snapshot } = await patch(git, repo, snapshot, ["src/similar.ts"]));
		await expectMatchesFull(git, repo, snapshot);
		expect(snapshot.unstaged.map((f) => f.status).sort()).toEqual([
			"deleted",
			"untracked",
		]);
	});

	test("an untracked file edited into similarity with a deleted file becomes a rename", async () => {
		await rm(join(repo, "src", "a.ts"));
		await writeFile(join(repo, "src", "n.ts"), "unrelated\n");
		let snapshot = await full(git, repo);
		expect(snapshot.unstaged.map((f) => f.status).sort()).toEqual([
			"deleted",
			"untracked",
		]);
		const original = await git.show(["HEAD:src/a.ts"]);
		await writeFile(join(repo, "src", "n.ts"), original);
		({ snapshot } = await patch(git, repo, snapshot, ["src/n.ts"]));
		await expectMatchesFull(git, repo, snapshot);
		expect(snapshot.unstaged.map((f) => f.status)).toEqual(["renamed"]);
	});

	test("staged rename (git mv) then a working-tree edit patches only the destination", async () => {
		await git.raw(["mv", "src/a.ts", "src/moved.ts"]);
		const before = await full(git, repo);
		expect(before.staged.map((f) => [f.path, f.oldPath, f.status])).toEqual([
			["src/moved.ts", "src/a.ts", "renamed"],
		]);
		await writeFile(join(repo, "src", "moved.ts"), "rewritten\n");
		const { snapshot, escalated } = await patch(git, repo, before, [
			"src/moved.ts",
		]);
		expect(escalated).toBe(false);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("two files renamed in one batch match", async () => {
		const before = await full(git, repo);
		await rename(join(repo, "src", "a.ts"), join(repo, "src", "a2.ts"));
		await rename(join(repo, "src", "b.ts"), join(repo, "src", "b2.ts"));
		const { snapshot } = await patch(git, repo, before, [
			"src/a.ts",
			"src/a2.ts",
			"src/b.ts",
			"src/b2.ts",
		]);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("a case-only rename on this filesystem matches whatever git says", async () => {
		const before = await full(git, repo);
		await rename(join(repo, "src", "b.ts"), join(repo, "src", "B.ts"));
		const { snapshot } = await patch(git, repo, before, [
			"src/b.ts",
			"src/B.ts",
		]);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("git add then edit again: staged untouched, unstaged patched", async () => {
		await writeFile(join(repo, "src", "b.ts"), "staged\n");
		await git.add("src/b.ts");
		const before = await full(git, repo);
		expect(before.staged.map((f) => f.path)).toEqual(["src/b.ts"]);
		await writeFile(join(repo, "src", "b.ts"), "staged\nand more\n");
		const { snapshot } = await patch(git, repo, before, ["src/b.ts"]);
		await expectMatchesFull(git, repo, snapshot);
		expect(
			snapshot.unstaged.map((f) => [f.path, f.status, f.additions]),
		).toEqual([["src/b.ts", "modified", 1]]);
	});

	test("intent-to-add (git add -N) next to a deletion matches", async () => {
		const content = await Bun.file(join(repo, "src", "a.ts")).text();
		await rm(join(repo, "src", "a.ts"));
		await writeFile(join(repo, "src", "ita.ts"), content);
		await git.raw(["add", "-N", "src/ita.ts"]);
		const before = await full(git, repo);
		await writeFile(join(repo, "src", "ita.ts"), `${content}// tweak\n`);
		const { snapshot } = await patch(git, repo, before, ["src/ita.ts"]);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("intent-to-add with the whole dir in scope matches", async () => {
		const content = await Bun.file(join(repo, "src", "a.ts")).text();
		const before = await full(git, repo);
		await rm(join(repo, "src", "a.ts"));
		await writeFile(join(repo, "src", "ita.ts"), content);
		await git.raw(["add", "-N", "src/ita.ts"]);
		const { snapshot } = await patch(git, repo, before, ["src"]);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("deleted in the index and re-created untracked matches unstaged", async () => {
		const before = await full(git, repo);
		await git.raw(["rm", "--cached", "src/b.ts"]);
		const { snapshot } = await patch(git, repo, before, ["src/b.ts"]);
		expect(normalize(snapshot.unstaged)).toEqual(
			normalize((await full(git, repo)).unstaged),
		);
		expect(snapshot.unstaged.map((f) => f.status)).toEqual(["untracked"]);
	});

	test("a snapshot rename whose source is re-created escalates", async () => {
		await rename(join(repo, "src", "a.ts"), join(repo, "src", "moved.ts"));
		let snapshot = await full(git, repo);
		await writeFile(join(repo, "src", "a.ts"), "brand new\n");
		const result = await patch(git, repo, snapshot, ["src/a.ts"]);
		snapshot = result.snapshot;
		expect(result.escalated).toBe(true);
		await expectMatchesFull(git, repo, snapshot);
	});

	test("long converging sequence of mixed batches", async () => {
		let snapshot = await full(git, repo);
		const steps: Array<{
			act: () => Promise<void>;
			paths: string[];
			broad?: boolean;
		}> = [
			{
				act: () => writeFile(join(repo, "src", "c.ts"), "c\n"),
				paths: ["src/c.ts"],
			},
			{
				act: () =>
					rename(join(repo, "src", "b.ts"), join(repo, "src", "b1.ts")),
				paths: ["src/b.ts", "src/b1.ts"],
			},
			{
				act: () =>
					writeFile(join(repo, "src", "b1.ts"), "const b = 2;\nmore\n"),
				paths: ["src/b1.ts"],
			},
			{
				act: async () => {
					await git.add("src/c.ts");
				},
				paths: ["src/c.ts"],
				// `.git/index` changed: production gets a broad event here.
				broad: true,
			},
			{
				act: () => writeFile(join(repo, "src", "c.ts"), "c\nc2\n"),
				paths: ["src/c.ts"],
			},
			{
				act: () => rm(join(repo, "src", "c.ts")),
				paths: ["src/c.ts"],
			},
			{
				act: () =>
					rename(join(repo, "src", "b1.ts"), join(repo, "src", "b.ts")),
				paths: ["src/b1.ts", "src/b.ts"],
			},
			{
				act: () => writeFile(join(repo, "src", "b.ts"), "const b = 2;\n"),
				paths: ["src/b.ts"],
			},
		];
		for (const step of steps) {
			await step.act();
			if (step.broad) {
				snapshot = await full(git, repo);
			} else {
				({ snapshot } = await patch(git, repo, snapshot, step.paths));
			}
			await expectMatchesFull(git, repo, snapshot);
		}
	});
});

describe("getGitStatusPartial: FIFO and vanished files", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-partial-adv-"));
		git = await initRepo(repo);
		await writeFile(join(repo, "README.md"), "hello\n");
		await git.add(".");
		await git.commit("init");
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("an untracked FIFO does not hang and stays null", async () => {
		execFileSync("mkfifo", [join(repo, "pipe")]);
		const before = await full(git, repo);
		const { snapshot } = await patch(git, repo, before, ["pipe"]);
		await expectMatchesFull(git, repo, snapshot);
		const entry = snapshot.unstaged.find((f) => f.path === "pipe");
		expect(entry).toBeUndefined();
	}, 10_000);
});
