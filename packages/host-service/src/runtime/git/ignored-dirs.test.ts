import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { listGitIgnoredDirs } from "./ignored-dirs";

const tempRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function createRepo(): Promise<string> {
	const dir = await mkdtemp(path.join(tmpdir(), "ignored-dirs-"));
	tempRoots.push(dir);
	await simpleGit(dir).init();
	return dir;
}

describe("listGitIgnoredDirs", () => {
	test("returns fully-ignored directories, not ignored files or tracked-content dirs", async () => {
		const dir = await createRepo();
		await writeFile(path.join(dir, ".gitignore"), "dist/\n*.log\nmixed/\n");
		await mkdir(path.join(dir, "dist"), { recursive: true });
		await writeFile(path.join(dir, "dist", "bundle.js"), "x");
		await writeFile(path.join(dir, "root.log"), "x");
		// A dir matching an ignore rule but holding a tracked file must never be
		// collapsed — pruning it would hide that file's changes.
		await mkdir(path.join(dir, "mixed"), { recursive: true });
		await writeFile(path.join(dir, "mixed", "kept.ts"), "x");
		const git = simpleGit(dir);
		await git.raw(["add", "-f", "mixed/kept.ts"]);

		const ignored = await listGitIgnoredDirs(dir);

		expect(ignored).toContain("dist");
		expect(ignored).not.toContain("root.log");
		expect(ignored.some((entry) => entry.startsWith("mixed"))).toBe(false);
	});

	test("returns [] for a non-git directory", async () => {
		const dir = await mkdtemp(path.join(tmpdir(), "ignored-dirs-plain-"));
		tempRoots.push(dir);
		expect(await listGitIgnoredDirs(dir)).toEqual([]);
	});

	test("returns [] for a missing path", async () => {
		expect(
			await listGitIgnoredDirs("/nonexistent/definitely-not-here"),
		).toEqual([]);
	});

	test("reports the on-disk casing when the .gitignore rule differs in case", async () => {
		// macOS: core.ignorecase makes `buildout/` match an on-disk `Buildout`.
		// What matters for the watcher is that the returned name is the ON-DISK
		// casing — that's what kernel event paths carry, so glob and filter
		// comparisons stay consistent. (On a case-sensitive FS the rule simply
		// doesn't match and nothing is returned — also consistent.)
		const dir = await createRepo();
		await writeFile(path.join(dir, ".gitignore"), "buildout/\n");
		await mkdir(path.join(dir, "Buildout"), { recursive: true });
		await writeFile(path.join(dir, "Buildout", "junk.js"), "x");

		const ignored = await listGitIgnoredDirs(dir);

		if (ignored.length > 0) {
			expect(ignored).toEqual(["Buildout"]);
		}
	});

	test("honors .git/info/exclude rules, not just .gitignore", async () => {
		const dir = await createRepo();
		await mkdir(path.join(dir, ".git", "info"), { recursive: true });
		await writeFile(path.join(dir, ".git", "info", "exclude"), "hidden/\n");
		await mkdir(path.join(dir, "hidden"), { recursive: true });
		await writeFile(path.join(dir, "hidden", "junk.js"), "x");

		expect(await listGitIgnoredDirs(dir)).toContain("hidden");
	});

	test("never returns a dir containing a negated (re-included) child", async () => {
		const dir = await createRepo();
		// `dist/*` + `!dist/keep.txt`: git will not collapse `dist/` because it
		// holds a non-ignored entry — pruning it would hide keep.txt forever.
		await writeFile(
			path.join(dir, ".gitignore"),
			"dist/*\n!dist/keep.txt\nfully/\n",
		);
		await mkdir(path.join(dir, "dist"), { recursive: true });
		await writeFile(path.join(dir, "dist", "bundle.js"), "x");
		await writeFile(path.join(dir, "dist", "keep.txt"), "x");
		await mkdir(path.join(dir, "fully"), { recursive: true });
		await writeFile(path.join(dir, "fully", "junk.js"), "x");

		const ignored = await listGitIgnoredDirs(dir);

		expect(ignored.some((entry) => entry.startsWith("dist"))).toBe(false);
		expect(ignored).toContain("fully");
	});
});
