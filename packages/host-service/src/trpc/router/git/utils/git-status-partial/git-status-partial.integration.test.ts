import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
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
	return [...files].sort((a, b) => a.path.localeCompare(b.path));
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

describe("getGitStatusPartial", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-status-partial-"));
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

	test("a tracked edit patches to the same state as a full walk", async () => {
		const before = await full(git, repo);
		await writeFile(join(repo, "src", "a.ts"), "const a = 1;\nconst c = 3;\n");

		const { snapshot, escalated } = await patch(git, repo, before, [
			"src/a.ts",
		]);

		expect(escalated).toBe(false);
		expect(normalize(snapshot.unstaged)).toEqual(
			normalize((await full(git, repo)).unstaged),
		);
		expect(
			snapshot.unstaged.find((file) => file.path === "src/a.ts")?.additions,
		).toBe(1);
	});

	test("an edit to an unopened nested file is not missed", async () => {
		await mkdir(join(repo, "src", "deep", "deeper"), { recursive: true });
		await writeFile(
			join(repo, "src", "deep", "deeper", "x.ts"),
			"let x = 0;\n",
		);
		await git.add(".");
		await git.commit("nested");

		const before = await full(git, repo);
		await writeFile(
			join(repo, "src", "deep", "deeper", "x.ts"),
			"let x = 0;\nlet y = 1;\n",
		);

		const { snapshot } = await patch(git, repo, before, [
			"src/deep/deeper/x.ts",
		]);

		expect(
			snapshot.unstaged.find((file) => file.path === "src/deep/deeper/x.ts")
				?.status,
		).toBe("modified");
	});

	test("a file reverted within scope leaves the snapshot", async () => {
		await writeFile(join(repo, "src", "a.ts"), "changed\n");
		const dirty = await full(git, repo);
		expect(dirty.unstaged.some((file) => file.path === "src/a.ts")).toBe(true);

		await writeFile(join(repo, "src", "a.ts"), "const a = 1;\n");
		const { snapshot } = await patch(git, repo, dirty, ["src/a.ts"]);

		expect(snapshot.unstaged.some((file) => file.path === "src/a.ts")).toBe(
			false,
		);
	});

	test("a new untracked file is counted", async () => {
		const before = await full(git, repo);
		await writeFile(join(repo, "src", "new.ts"), "one\ntwo\nthree\n");

		const { snapshot } = await patch(git, repo, before, ["src/new.ts"]);

		const entry = snapshot.unstaged.find((file) => file.path === "src/new.ts");
		expect(entry?.status).toBe("untracked");
		expect(entry?.additions).toBe(3);
	});

	test("a whole new untracked directory expands under its scope", async () => {
		const before = await full(git, repo);
		await mkdir(join(repo, "fresh", "nested"), { recursive: true });
		await writeFile(join(repo, "fresh", "one.ts"), "a\n");
		await writeFile(join(repo, "fresh", "nested", "two.ts"), "b\n");

		const { snapshot } = await patch(git, repo, before, ["fresh"]);

		expect(normalize(snapshot.unstaged)).toEqual(
			normalize((await full(git, repo)).unstaged),
		);
		expect(snapshot.unstaged.map((file) => file.path).sort()).toEqual([
			"fresh/nested/two.ts",
			"fresh/one.ts",
		]);
	});

	test("a deletion escalates to a full walk so renames survive", async () => {
		const before = await full(git, repo);
		await rename(join(repo, "src", "a.ts"), join(repo, "src", "renamed.ts"));

		const { snapshot, escalated } = await patch(git, repo, before, [
			"src/a.ts",
			"src/renamed.ts",
		]);

		expect(escalated).toBe(true);
		expect(normalize(snapshot.unstaged)).toEqual(
			normalize((await full(git, repo)).unstaged),
		);
	});

	test("editing a renamed file keeps the rename and its deletion", async () => {
		await rename(join(repo, "src", "a.ts"), join(repo, "src", "renamed.ts"));
		const before = await full(git, repo);
		expect(before.unstaged.map((file) => file.status)).toEqual(["renamed"]);

		await writeFile(join(repo, "src", "renamed.ts"), "const a = 1;\n// edit\n");
		const { snapshot, escalated } = await patch(git, repo, before, [
			"src/renamed.ts",
		]);

		expect(escalated).toBe(true);
		expect(normalize(snapshot.unstaged)).toEqual(
			normalize((await full(git, repo)).unstaged),
		);
		expect(snapshot.unstaged.map((file) => file.status)).toEqual(["renamed"]);
	});

	test("a decomposed (NFD) watcher path patches the composed entry git reports", async () => {
		const composed = "caf\u00e9.txt".normalize("NFC");
		const decomposed = composed.normalize("NFD");
		expect(decomposed).not.toBe(composed);
		await writeFile(join(repo, composed), "a\n");
		await git.add(".");
		await git.commit("unicode");
		await writeFile(join(repo, composed), "a\nb\n");
		const before = await full(git, repo);
		expect(before.unstaged.map((file) => file.path)).toEqual([composed]);

		await writeFile(join(repo, composed), "a\nb\nc\n");
		const { snapshot } = await patch(git, repo, before, [decomposed]);

		expect(
			snapshot.unstaged.map((file) => [file.path, file.additions]),
		).toEqual([[composed, 2]]);
	});

	test("a sequence of batches converges on the full-walk result", async () => {
		let snapshot = await full(git, repo);

		const batches: { act: () => Promise<void>; paths: string[] }[] = [
			{
				act: () => writeFile(join(repo, "src", "a.ts"), "one\ntwo\n"),
				paths: ["src/a.ts"],
			},
			{
				act: () => writeFile(join(repo, "src", "fresh.ts"), "new\n"),
				paths: ["src/fresh.ts"],
			},
			{
				act: () => writeFile(join(repo, "src", "b.ts"), "const b = 22;\n"),
				paths: ["src/b.ts"],
			},
			{
				act: async () => {
					await mkdir(join(repo, "docs"), { recursive: true });
					await writeFile(join(repo, "docs", "guide.md"), "# guide\n");
				},
				paths: ["docs"],
			},
			{
				act: () => writeFile(join(repo, "src", "a.ts"), "const a = 1;\n"),
				paths: ["src/a.ts"],
			},
			{
				act: () => rm(join(repo, "src", "fresh.ts")),
				paths: ["src/fresh.ts"],
			},
		];

		for (const batch of batches) {
			await batch.act();
			({ snapshot } = await patch(git, repo, snapshot, batch.paths));
			expect(normalize(snapshot.unstaged)).toEqual(
				normalize((await full(git, repo)).unstaged),
			);
		}
	});

	test("branches and the against-base diff survive a patch untouched", async () => {
		const before = await full(git, repo);
		await writeFile(join(repo, "src", "a.ts"), "edited\n");

		const { snapshot } = await patch(git, repo, before, ["src/a.ts"]);

		expect(snapshot.currentBranch).toEqual(before.currentBranch);
		expect(snapshot.defaultBranch).toEqual(before.defaultBranch);
		expect(snapshot.againstBase).toEqual(before.againstBase);
		expect(snapshot.staged).toEqual(before.staged);
		expect(snapshot.ignoredPaths).toEqual(before.ignoredPaths);
	});
});

describe("coalescePaths", () => {
	test("drops paths covered by an ancestor already in the set", () => {
		expect(coalescePaths(["src", "src/a.ts", "src/deep/b.ts", "docs"])).toEqual(
			["docs", "src"],
		);
	});

	test("keeps siblings that merely share a prefix string", () => {
		expect(coalescePaths(["src", "srcfoo/a.ts"])).toEqual([
			"src",
			"srcfoo/a.ts",
		]);
	});

	test("de-duplicates", () => {
		expect(coalescePaths(["a.ts", "a.ts"])).toEqual(["a.ts"]);
	});
});
