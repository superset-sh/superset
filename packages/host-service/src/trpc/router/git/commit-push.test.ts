import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import type { HostServiceContext } from "../../../types";
import { gitRouter } from "./git";

/**
 * Real repos on a real filesystem — only the db lookup and the git factory
 * are stubbed, same as discard-changes.test.ts. Push runs against a local
 * bare "remote" so no network is involved.
 */
function createCaller(
	worktreePath: string | undefined,
	linkedPrHeadBranch?: string,
) {
	const ctx = {
		isAuthenticated: true,
		db: {
			query: {
				workspaces: {
					findFirst: () => ({
						sync: () => ({
							worktreePath,
							pullRequestId: linkedPrHeadBranch ? "pr-1" : null,
						}),
					}),
				},
				pullRequests: {
					findFirst: () => ({
						sync: () =>
							linkedPrHeadBranch ? { headBranch: linkedPrHeadBranch } : null,
					}),
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

describe("gitRouter.commit", () => {
	let root: string;
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), "git-commit-test-"));
		repo = join(root, "repo");
		await mkdir(repo);
		git = await initRepo(repo);
		await writeFile(join(repo, "base.txt"), "base\n");
		await git.add(["base.txt"]);
		await git.commit("initial");
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test("stages everything and commits by default", async () => {
		await writeFile(join(repo, "new.txt"), "hello\n");
		const caller = createCaller(repo);
		const result = await caller.commit({
			workspaceId: "ws",
			message: "add new.txt",
		});
		expect(result.success).toBe(true);
		expect(result.hash).toMatch(/^[0-9a-f]{40}$/);
		const log = await git.log({ maxCount: 1 });
		expect(log.latest?.message).toBe("add new.txt");
		const status = await git.status();
		expect(status.files).toHaveLength(0);
	});

	test("stageAll=false commits only what is already staged", async () => {
		await writeFile(join(repo, "staged.txt"), "staged\n");
		await git.add(["staged.txt"]);
		await writeFile(join(repo, "unstaged.txt"), "unstaged\n");
		const caller = createCaller(repo);
		await caller.commit({
			workspaceId: "ws",
			message: "staged only",
			stageAll: false,
		});
		const status = await git.status();
		expect(status.not_added).toEqual(["unstaged.txt"]);
	});

	test("throws BAD_REQUEST when there is nothing to commit", async () => {
		const caller = createCaller(repo);
		await expect(
			caller.commit({ workspaceId: "ws", message: "empty" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});

describe("gitRouter.push", () => {
	let root: string;
	let repo: string;
	let remote: string;
	let git: SimpleGit;

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), "git-push-test-"));
		remote = join(root, "remote.git");
		await simpleGit(root).raw(["init", "--bare", remote]);
		repo = join(root, "repo");
		await mkdir(repo);
		git = await initRepo(repo);
		await writeFile(join(repo, "base.txt"), "base\n");
		await git.add(["base.txt"]);
		await git.commit("initial");
		await git.addRemote("origin", remote);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test("sets upstream on first push, plain-pushes after", async () => {
		const caller = createCaller(repo);
		await caller.push({ workspaceId: "ws" });
		const upstream = (
			await git.raw(["rev-parse", "--abbrev-ref", "@{upstream}"])
		).trim();
		expect(upstream).toBe("origin/main");

		await writeFile(join(repo, "more.txt"), "more\n");
		await git.add(["more.txt"]);
		await git.commit("more");
		await caller.push({ workspaceId: "ws" });
		// The bare remote's own HEAD still points at an unborn master; read the
		// pushed branch explicitly.
		const remoteSubject = await simpleGit(remote).raw([
			"log",
			"-1",
			"--pretty=%s",
			"main",
		]);
		expect(remoteSubject.trim()).toBe("more");
	});

	test("upstream on the base branch pushes under the branch's own name", async () => {
		// Workspace branches fork from the base with autoSetupMerge, ending up
		// tracking e.g. origin/main — plain `git push` refuses the name
		// mismatch, and pushing to main would be wrong anyway.
		await git.push(["-u", "origin", "main"]);
		await git.checkoutBranch("feature", "main");
		await git.raw(["branch", "--set-upstream-to=origin/main", "feature"]);
		await writeFile(join(repo, "feat.txt"), "feat\n");
		await git.add(["feat.txt"]);
		await git.commit("feature work");

		const caller = createCaller(repo);
		await caller.push({ workspaceId: "ws" });

		const remoteGit = simpleGit(remote);
		const remoteBranches = await remoteGit.raw(["branch", "--list"]);
		expect(remoteBranches).toContain("feature");
		const mainSubject = await remoteGit.raw([
			"log",
			"-1",
			"--pretty=%s",
			"main",
		]);
		expect(mainSubject.trim()).toBe("initial");
		const upstream = (
			await git.raw(["rev-parse", "--abbrev-ref", "@{upstream}"])
		).trim();
		expect(upstream).toBe("origin/feature");
	});

	test("pushes to the linked PR head when the upstream deliberately differs", async () => {
		// PR-checkout workspaces track the PR's head branch under a different
		// local name; the push must update that branch, not publish a new one.
		await git.push(["-u", "origin", "main"]);
		await git.checkoutBranch("feature-x", "main");
		await git.push(["origin", "feature-x"]);
		await git.checkoutBranch("alice/feature-x", "feature-x");
		await git.raw(["branch", "--set-upstream-to=origin/feature-x"]);
		await writeFile(join(repo, "pr.txt"), "pr\n");
		await git.add(["pr.txt"]);
		await git.commit("pr work");

		const caller = createCaller(repo, "feature-x");
		await caller.push({ workspaceId: "ws" });

		const remoteGit = simpleGit(remote);
		const headSubject = await remoteGit.raw([
			"log",
			"-1",
			"--pretty=%s",
			"feature-x",
		]);
		expect(headSubject.trim()).toBe("pr work");
		const remoteBranches = await remoteGit.raw(["branch", "--list"]);
		expect(remoteBranches).not.toContain("alice/feature-x");
		const upstream = (
			await git.raw(["rev-parse", "--abbrev-ref", "@{upstream}"])
		).trim();
		expect(upstream).toBe("origin/feature-x");
	});

	test("throws BAD_REQUEST on a detached HEAD", async () => {
		const head = (await git.revparse(["HEAD"])).trim();
		await git.raw(["checkout", "--detach", head]);
		const caller = createCaller(repo);
		await expect(caller.push({ workspaceId: "ws" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	test("throws BAD_REQUEST when no remote exists", async () => {
		await git.removeRemote("origin");
		const caller = createCaller(repo);
		await expect(caller.push({ workspaceId: "ws" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});
});
