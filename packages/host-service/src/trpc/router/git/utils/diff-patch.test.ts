import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { buildDiffPatch } from "./diff-patch.ts";

/**
 * The bound exists because a working tree can hold a file of any size and an
 * untracked file's diff is that whole file: unbounded, the patch is the
 * repository, and V8 threw `RangeError: Invalid string length` building it
 * (HOST-SERVICE-5C). These cases pin what the caller gets instead — whole
 * file sections up to the bound, never half of one.
 */

const ENV = { GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" };

async function initRepo(path: string): Promise<SimpleGit> {
	const git = simpleGit(path);
	await git.init();
	await git.raw(["config", "user.email", "test@example.com"]);
	await git.raw(["config", "user.name", "test"]);
	await git.raw(["config", "commit.gpgsign", "false"]);
	await git.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);
	return git;
}

function lines(count: number, marker: string): string {
	return `${Array.from({ length: count }, (_, i) => `${marker} line ${i}`).join("\n")}\n`;
}

describe("buildDiffPatch", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-diff-bound-"));
		git = await initRepo(repo);
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("cuts the patch on a file boundary instead of mid-section", async () => {
		for (const name of ["a.txt", "b.txt", "c.txt"]) {
			await writeFile(join(repo, name), lines(400, "old"));
		}
		await git.add(["."]);
		await git.commit("initial");
		for (const name of ["a.txt", "b.txt", "c.txt"]) {
			await writeFile(join(repo, name), lines(400, "new"));
		}

		const request = {
			cwd: repo,
			env: ENV,
			category: "unstaged" as const,
			refs: {},
		};
		const full = await buildDiffPatch(request);
		const bounded = await buildDiffPatch({
			...request,
			maxBytes: Math.floor(full.length / 2),
		});

		expect(bounded.length).toBeLessThan(full.length);
		expect(bounded.length).toBeGreaterThan(0);
		// A prefix of the real patch, ending exactly where a file section
		// starts: no file is shown a diff missing its tail.
		expect(full.startsWith(bounded)).toBe(true);
		expect(full.slice(bounded.length).startsWith("diff --git ")).toBe(true);
	});

	test("an untracked file past the bound leaves the tracked patch intact", async () => {
		await writeFile(join(repo, "tracked.txt"), "one\ntwo\nthree\n");
		await git.add(["tracked.txt"]);
		await git.commit("initial");
		await writeFile(join(repo, "tracked.txt"), "one\nTWO\nthree\n");
		await writeFile(join(repo, "huge.log"), lines(200_000, "noise"));

		const patch = await buildDiffPatch({
			cwd: repo,
			env: ENV,
			category: "unstaged",
			refs: {},
			untrackedPaths: ["huge.log"],
			maxBytes: 64 * 1024,
		});

		expect(patch).toContain("diff --git a/tracked.txt b/tracked.txt");
		expect(patch).toContain("+TWO");
		expect(patch).not.toContain("huge.log");
		expect(patch.length).toBeLessThanOrEqual(64 * 1024);
	});

	test("a bound nothing reaches keeps every section, last one included", async () => {
		await writeFile(join(repo, "tracked.txt"), "one\ntwo\n");
		await git.add(["tracked.txt"]);
		await git.commit("initial");
		await writeFile(join(repo, "tracked.txt"), "one\nTWO\n");
		await writeFile(join(repo, "fresh.txt"), "brand new\n");

		const request = {
			cwd: repo,
			env: ENV,
			category: "unstaged" as const,
			refs: {},
			untrackedPaths: ["fresh.txt"],
		};
		const patch = await buildDiffPatch({ ...request, maxBytes: 1024 * 1024 });
		expect(patch).toBe(await buildDiffPatch(request));
		// The cut only ever applies to a diff that was stopped mid-stream: a
		// patch that fit keeps its last file section, which is the one an
		// over-eager cut would take.
		expect(patch).toContain("+TWO");
		expect(patch).toContain("+brand new");
	});
});
