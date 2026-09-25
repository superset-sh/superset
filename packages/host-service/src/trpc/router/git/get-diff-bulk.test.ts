import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import type { HostServiceContext } from "../../../types";
import { gitRouter } from "./git";

/**
 * Proves `getDiffBulk` scales to a large changeset in one call: a real repo
 * with a few hundred added files, diffed in a single request instead of one
 * `getDiff` call per file. Guards against the N+1/quadratic regression this
 * endpoint replaced (see DiffPane's useDiffCodeViewItems).
 */

const FILE_COUNT = 300;

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

function mkTmp(): string {
	return mkdtempSync(join(tmpdir(), "superset-diff-bulk-"));
}

describe("gitRouter.getDiffBulk — large changeset", () => {
	let repo: string;
	let git: SimpleGit;
	let paths: string[];

	beforeEach(async () => {
		repo = mkTmp();
		git = await initRepo(repo);

		await writeFile(join(repo, "seed.txt"), "seed\n");
		await git.raw(["add", "--", "seed.txt"]);
		await git.raw(["commit", "-m", "seed"]);
		const baseSha = (await git.revparse(["HEAD"])).trim();

		// origin/main tracks the pre-changeset commit — this is what
		// "against-base" resolves against via resolveBaseComparison.
		await git.raw(["update-ref", "refs/remotes/origin/main", baseSha]);
		await git.raw([
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
			"refs/remotes/origin/main",
		]);
		await git.raw(["config", "branch.main.remote", "origin"]);
		await git.raw(["config", "branch.main.merge", "refs/heads/main"]);

		paths = Array.from(
			{ length: FILE_COUNT },
			(_, i) => `src/generated/file-${i}.ts`,
		);
		await mkdir(join(repo, "src", "generated"), { recursive: true });
		for (const path of paths) {
			await writeFile(
				join(repo, path),
				`export const value = ${paths.indexOf(path)};\n`,
			);
		}
		await git.raw(["add", "-A"]);
		await git.raw(["commit", "-m", `add ${FILE_COUNT} files`]);
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("returns every file's diff in one call, and stays fast", async () => {
		const caller = createCaller(repo);
		const result = await caller.getDiffBulk({
			workspaceId: "ws-1",
			paths,
			category: "against-base",
		});

		expect(result.diffs).toHaveLength(FILE_COUNT);

		const byPath = new Map(result.diffs.map((d) => [d.path, d]));
		const first = byPath.get("src/generated/file-0.ts");
		const last = byPath.get(`src/generated/file-${FILE_COUNT - 1}.ts`);
		expect(first?.oldFile.contents).toBe("");
		expect(first?.newFile.contents).toBe("export const value = 0;\n");
		expect(last?.newFile.contents).toBe(
			`export const value = ${FILE_COUNT - 1};\n`,
		);

		// The 90s test timeout is the hang/quadratic-scaling guard.
	}, 90_000);

	test("matches per-file getDiff output for every file", async () => {
		const caller = createCaller(repo);
		const bulk = await caller.getDiffBulk({
			workspaceId: "ws-1",
			paths,
			category: "against-base",
		});
		const byPath = new Map(bulk.diffs.map((d) => [d.path, d]));

		// Spot-check a sample rather than all 300 — this asserts getDiffBulk
		// didn't diverge from getDiff's per-category logic, not scale.
		const sample = [
			paths[0],
			paths[Math.floor(FILE_COUNT / 2)],
			paths[FILE_COUNT - 1],
		].filter((path): path is string => path !== undefined);
		for (const path of sample) {
			const single = await caller.getDiff({
				workspaceId: "ws-1",
				path,
				category: "against-base",
			});
			const bulkEntry = byPath.get(path);
			expect({
				oldFile: bulkEntry?.oldFile,
				newFile: bulkEntry?.newFile,
			}).toEqual(single);
		}
	}, 30_000);

	test("rejects a path-traversal path instead of reading outside the worktree", async () => {
		const caller = createCaller(repo);
		const traversal = "../../../../../../../../etc/passwd";

		await expect(
			caller.getDiff({
				workspaceId: "ws-1",
				path: traversal,
				category: "unstaged",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		await expect(
			caller.getDiffBulk({
				workspaceId: "ws-1",
				paths: [traversal],
				category: "unstaged",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
