import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findNestedRepoRoots } from "./find-nested-repos";
import { DEFAULT_IGNORE_DIR_NAMES } from "./search";

const tempRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((root) => fs.rm(root, { recursive: true, force: true })),
	);
});

async function createTempRoot(): Promise<string> {
	const tempPath = await fs.mkdtemp(path.join(os.tmpdir(), "nested-repos-"));
	const real = await fs.realpath(tempPath);
	tempRoots.push(real);
	return real;
}

async function mkdirp(...segments: string[]): Promise<string> {
	const dir = path.join(...segments);
	await fs.mkdir(dir, { recursive: true });
	return dir;
}

async function makeGitDir(dir: string): Promise<void> {
	await fs.mkdir(path.join(dir, ".git"), { recursive: true });
}

async function makeGitWorktreeFile(dir: string): Promise<void> {
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(path.join(dir, ".git"), "gitdir: /somewhere/else\n");
}

describe("findNestedRepoRoots", () => {
	it("discovers nested worktree roots (`.git` as a file) below the root", async () => {
		const root = await createTempRoot();
		await makeGitDir(root); // the root is itself a repo — must be exempt
		const worktreeA = path.join(root, ".claude", "worktrees", "aaa");
		const worktreeB = path.join(root, ".claude", "worktrees", "bbb");
		await makeGitWorktreeFile(worktreeA);
		await makeGitWorktreeFile(worktreeB);

		const { roots, truncated } = await findNestedRepoRoots(root, {
			pruneDirNames: DEFAULT_IGNORE_DIR_NAMES,
		});

		expect(truncated).toBe(false);
		expect(new Set(roots)).toEqual(new Set([worktreeA, worktreeB]));
		expect(roots).not.toContain(root);
	});

	it("does not descend into a discovered nested repo", async () => {
		const root = await createTempRoot();
		const nested = path.join(root, "packages", "vendored");
		await makeGitDir(nested);
		// A deeper repo inside the nested one must never be reported — the scan
		// prunes at the first boundary.
		const deeper = path.join(nested, "sub", "inner");
		await makeGitDir(deeper);

		const { roots } = await findNestedRepoRoots(root, {
			pruneDirNames: DEFAULT_IGNORE_DIR_NAMES,
		});

		expect(roots).toEqual([nested]);
	});

	it("skips pruned directories (node_modules) without scanning into them", async () => {
		const root = await createTempRoot();
		// A repo buried inside node_modules must not be discovered — node_modules
		// is pruned before we ever read its children.
		const buried = path.join(root, "node_modules", "pkg");
		await makeGitDir(buried);

		const { roots } = await findNestedRepoRoots(root, {
			pruneDirNames: DEFAULT_IGNORE_DIR_NAMES,
		});

		expect(roots).toEqual([]);
	});

	it("reports truncation when the root cap is hit", async () => {
		const root = await createTempRoot();
		await makeGitWorktreeFile(path.join(root, "a"));
		await makeGitWorktreeFile(path.join(root, "b"));
		await makeGitWorktreeFile(path.join(root, "c"));

		const { roots, truncated } = await findNestedRepoRoots(root, {
			pruneDirNames: DEFAULT_IGNORE_DIR_NAMES,
			maxRoots: 2,
		});

		expect(truncated).toBe(true);
		expect(roots.length).toBe(2);
	});

	it("reports truncation when the directory cap is hit", async () => {
		const root = await createTempRoot();
		// A wide, repo-free tree so the scan is bounded by maxDirs, not maxRoots.
		for (let i = 0; i < 10; i++) {
			await mkdirp(root, `d-${i}`, "child");
		}

		const { truncated } = await findNestedRepoRoots(root, {
			pruneDirNames: DEFAULT_IGNORE_DIR_NAMES,
			maxDirs: 3,
		});

		expect(truncated).toBe(true);
	});

	it("reports truncation when the wall-clock deadline is hit", async () => {
		const root = await createTempRoot();
		await mkdirp(root, "a", "b");
		await mkdirp(root, "c", "d");
		// Clock jumps past the deadline on the second loop check.
		let ticks = 0;
		const now = () => ticks++ * 1_000;

		const { truncated } = await findNestedRepoRoots(root, {
			pruneDirNames: DEFAULT_IGNORE_DIR_NAMES,
			deadlineMs: 1,
			now,
		});

		expect(truncated).toBe(true);
	});

	it("skips symlinked directories (no cycles, no escape)", async () => {
		const root = await createTempRoot();
		const realTree = await mkdirp(root, "real");
		await makeGitDir(path.join(realTree, "repo"));
		// Symlink loop back to the root: isDirectory() is false for the link, so
		// it's never followed and the scan terminates.
		await fs.symlink(root, path.join(root, "loop"), "dir");

		const { roots, truncated } = await findNestedRepoRoots(root, {
			pruneDirNames: DEFAULT_IGNORE_DIR_NAMES,
		});

		expect(truncated).toBe(false);
		expect(roots).toEqual([path.join(realTree, "repo")]);
	});
});
