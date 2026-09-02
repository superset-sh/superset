import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import type { HostServiceContext } from "../../../types";
import { gitRouter } from "./git";

/**
 * `getDiffPatch` returns one patch per category, which the Changes pane parses
 * into per-file metadata without moving whole files. These cases pin the ref
 * pair each category diffs, since a wrong pair silently shows the wrong side.
 */

function createCaller(worktreePath: string) {
	const ctx = {
		isAuthenticated: true,
		db: {
			query: {
				workspaces: {
					findFirst: () => ({ sync: () => ({ worktreePath }) }),
				},
			},
		},
		git: async (path: string) => simpleGit(path),
		credentials: {
			getCredentials: async () => ({ env: {} }),
			getToken: async () => null,
		},
	} as unknown as HostServiceContext;
	return gitRouter.createCaller(ctx);
}

async function initRepo(path: string): Promise<SimpleGit> {
	const git = simpleGit(path);
	await git.init();
	await git.raw(["config", "user.email", "test@example.com"]);
	await git.raw(["config", "user.name", "test"]);
	await git.raw(["config", "commit.gpgsign", "false"]);
	await git.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);
	return git;
}

describe("gitRouter.getDiffPatch", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-diff-patch-"));
		git = await initRepo(repo);
		await writeFile(join(repo, "tracked.txt"), "one\ntwo\nthree\n");
		await git.add(["tracked.txt"]);
		await git.commit("initial");
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("unstaged patch carries the working-tree edit", async () => {
		await writeFile(join(repo, "tracked.txt"), "one\nTWO\nthree\n");
		const { patch } = await createCaller(repo).getDiffPatch({
			workspaceId: "ws",
			category: "unstaged",
		});
		expect(patch).toContain("diff --git a/tracked.txt b/tracked.txt");
		expect(patch).toContain("-two");
		expect(patch).toContain("+TWO");
	});

	test("staged patch carries the index edit, unstaged does not", async () => {
		await writeFile(join(repo, "tracked.txt"), "one\nSTAGED\nthree\n");
		await git.add(["tracked.txt"]);
		const caller = createCaller(repo);

		const staged = await caller.getDiffPatch({
			workspaceId: "ws",
			category: "staged",
		});
		expect(staged.patch).toContain("+STAGED");

		const unstaged = await caller.getDiffPatch({
			workspaceId: "ws",
			category: "unstaged",
		});
		expect(unstaged.patch).toBe("");
	});

	test("untracked files get their own /dev/null patch section", async () => {
		await writeFile(join(repo, "fresh.txt"), "brand new\n");
		const { patch } = await createCaller(repo).getDiffPatch({
			workspaceId: "ws",
			category: "unstaged",
			untrackedPaths: ["fresh.txt"],
		});
		expect(patch).toContain("fresh.txt");
		expect(patch).toContain("+brand new");
	});

	test("paths restrict the patch to the files asked for", async () => {
		await writeFile(join(repo, "tracked.txt"), "one\nedited\nthree\n");
		await writeFile(join(repo, "other.txt"), "second file\n");
		await git.add(["other.txt"]);
		await git.commit("add other");
		await writeFile(join(repo, "other.txt"), "second file edited\n");

		const { patch } = await createCaller(repo).getDiffPatch({
			workspaceId: "ws",
			category: "unstaged",
			paths: ["tracked.txt"],
		});
		expect(patch).toContain("tracked.txt");
		expect(patch).not.toContain("other.txt");
	});

	test("a commit patch diffs the commit against its parent", async () => {
		await writeFile(join(repo, "tracked.txt"), "one\ncommitted\nthree\n");
		await git.add(["tracked.txt"]);
		await git.commit("second");
		const head = (await git.revparse(["HEAD"])).trim();

		const { patch } = await createCaller(repo).getDiffPatch({
			workspaceId: "ws",
			category: "commit",
			commitHash: head,
		});
		expect(patch).toContain("+committed");
		expect(patch).toContain("-two");
	});

	test("a failing git diff rejects instead of returning an empty patch", async () => {
		// An empty patch is indistinguishable from "nothing changed", which
		// would strand every file on a placeholder with no way to retry.
		await expect(
			createCaller(repo).getDiffPatch({
				workspaceId: "ws",
				category: "commit",
				commitHash: "0000000000000000000000000000000000000000",
			}),
		).rejects.toThrow();
	});

	test("the patch is a fraction of the bytes the file contents would be", async () => {
		const big = Array.from({ length: 5_000 }, (_, i) => `line ${i}`).join("\n");
		await writeFile(join(repo, "big.txt"), `${big}\n`);
		await git.add(["big.txt"]);
		await git.commit("add big");
		await writeFile(join(repo, "big.txt"), `${big}\nappended\n`);

		const { patch } = await createCaller(repo).getDiffPatch({
			workspaceId: "ws",
			category: "unstaged",
		});
		expect(patch).toContain("+appended");
		// Two full copies would be ~2x the file; a one-line change is hunks only.
		expect(patch.length).toBeLessThan(big.length / 10);
	});
});
