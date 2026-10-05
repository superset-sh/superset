import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import simpleGit, { type SimpleGit } from "simple-git";
import type { HostServiceContext } from "../../../types";
import { gitRouter } from "./git";

/**
 * Revisions and branch names from the caller are handed to git as their own
 * argv entries, and git parses options anywhere on the line. Without input
 * validation, `fromHash: "--output=/some/file"` turns `git diff` into a write
 * to that file. These cases pin the rejection at the tRPC boundary.
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

async function expectBadRequest(promise: Promise<unknown>) {
	try {
		await promise;
		throw new Error("expected the call to reject");
	} catch (error) {
		expect(error).toBeInstanceOf(TRPCError);
		expect((error as TRPCError).code).toBe("BAD_REQUEST");
	}
}

describe("gitRouter revision inputs", () => {
	let repo: string;
	let git: SimpleGit;
	let head: string;
	let outputFile: string;

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-revision-inputs-"));
		git = simpleGit(repo);
		await git.init();
		await git.raw(["config", "user.email", "test@example.com"]);
		await git.raw(["config", "user.name", "test"]);
		await git.raw(["config", "commit.gpgsign", "false"]);
		await git.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);
		await writeFile(join(repo, "tracked.txt"), "one\n");
		await git.add(["tracked.txt"]);
		await git.commit("initial");
		await writeFile(join(repo, "tracked.txt"), "one\ntwo\n");
		await git.add(["tracked.txt"]);
		await git.commit("second");
		head = (await git.revparse(["HEAD"])).trim();
		outputFile = join(repo, "..", `superset-revision-inputs-${Date.now()}`);
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
		rmSync(outputFile, { force: true });
	});

	test("getCommitFiles rejects a fromHash that is a git option", async () => {
		await expectBadRequest(
			createCaller(repo).getCommitFiles({
				workspaceId: "ws",
				commitHash: head,
				fromHash: `--output=${outputFile}`,
			}),
		);
		expect(existsSync(outputFile)).toBe(false);
	});

	test("getCommitFiles still diffs a real commit", async () => {
		const { files } = await createCaller(repo).getCommitFiles({
			workspaceId: "ws",
			commitHash: head,
		});
		expect(files.map((f) => f.path)).toEqual(["tracked.txt"]);
	});

	test("getDiffPatch rejects a commitHash that is a git option", async () => {
		await expectBadRequest(
			createCaller(repo).getDiffPatch({
				workspaceId: "ws",
				category: "commit",
				commitHash: `--output=${outputFile}`,
			}),
		);
		expect(existsSync(outputFile)).toBe(false);
	});

	test("getStatus rejects a baseBranch that is a git option", async () => {
		await expectBadRequest(
			createCaller(repo).getStatus({
				workspaceId: "ws",
				baseBranch: `--output=${outputFile}`,
			}),
		);
		expect(existsSync(outputFile)).toBe(false);
	});

	test("renameBranch rejects names that are git options", async () => {
		await expectBadRequest(
			createCaller(repo).renameBranch({
				workspaceId: "ws",
				oldName: "main",
				newName: "-D",
			}),
		);
		expect((await git.branchLocal()).all).toEqual(["main"]);
	});

	test("setBaseBranch rejects a value that is a git option", async () => {
		await expectBadRequest(
			createCaller(repo).setBaseBranch({
				workspaceId: "ws",
				baseBranch: "--unset",
			}),
		);
	});
});
