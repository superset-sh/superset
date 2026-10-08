import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUserSimpleGit } from "../../../../runtime/git/simple-git";
import type { HostServiceContext } from "../../../../types";
import { createCallerFactory, router } from "../../../index";
import {
	pullRequestContentCacheKey,
	readPullRequestContentCache,
	writePullRequestContentCache,
} from "../shared/pull-request-content-cache";
import {
	createTestDb,
	PR_NUMBER,
	PROJECT_ID,
	REPO,
	readPullRequestRow,
	seedLinkedPullRequest,
	UNLINKED_PR_NUMBER,
} from "../shared/test-db";
import { mergePR } from "./merge";

const tempDirs: string[] = [];
afterAll(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/** A real repo whose origin is the GitHub remote resolveGithubRepo reads. */
async function createRepoWithOrigin(): Promise<string> {
	const dir = mkdtempSync(join(tmpdir(), "pr-merge-test-"));
	tempDirs.push(dir);
	const git = createUserSimpleGit(dir);
	await git.init();
	await git.addConfig("user.email", "test@test.local");
	await git.addConfig("user.name", "Test");
	await git.raw(["commit", "--allow-empty", "-m", "init"]);
	await git.addRemote(
		"origin",
		`https://github.com/${REPO.owner}/${REPO.name}.git`,
	);
	return (await git.revparse(["--show-toplevel"])).trim();
}

const createCaller = createCallerFactory(router({ mergePR }));

interface Harness {
	caller: ReturnType<typeof createCaller>;
	db: ReturnType<typeof createTestDb>;
	mergeCalls: unknown[];
	refreshCalls: string[][];
}

async function createHarness(
	options: {
		merge?: () => Promise<unknown>;
		refresh?: (ids: string[]) => Promise<void>;
	} = {},
): Promise<Harness> {
	const db = createTestDb();
	seedLinkedPullRequest(db, await createRepoWithOrigin());
	const mergeCalls: unknown[] = [];
	const refreshCalls: string[][] = [];
	const octokit = {
		pulls: {
			merge: async (args: unknown) => {
				mergeCalls.push(args);
				if (options.merge) return options.merge();
				return { data: { sha: "deadbeef", merged: true, message: "ok" } };
			},
		},
	};
	const ctx = {
		db,
		github: async () => octokit,
		runtime: {
			pullRequests: {
				refreshPullRequestsByWorkspaces: async (ids: string[]) => {
					refreshCalls.push(ids);
					if (options.refresh) await options.refresh(ids);
				},
			},
		},
		isAuthenticated: true,
		organizationId: "org-test",
	} as unknown as HostServiceContext;
	return {
		caller: createCaller(ctx),
		db,
		mergeCalls,
		refreshCalls,
	};
}

describe("pullRequests.mergePR", () => {
	const warn = spyOn(console, "warn").mockImplementation(() => {});

	afterEach(() => {
		warn.mockClear();
	});

	afterAll(() => {
		warn.mockRestore();
	});

	test("merges on GitHub, drops the cached content, then refreshes the linked workspaces", async () => {
		const harness = await createHarness();
		const key = pullRequestContentCacheKey(REPO, PR_NUMBER);
		writePullRequestContentCache(key, Promise.resolve({ state: "open" }));

		const result = await harness.caller.mergePR({
			projectId: PROJECT_ID,
			prNumber: PR_NUMBER,
			mergeMethod: "squash",
		});

		expect(result.merged).toBe(true);
		expect(harness.mergeCalls[0]).toMatchObject({
			owner: REPO.owner,
			repo: REPO.name,
			pull_number: PR_NUMBER,
			merge_method: "squash",
		});
		expect(readPullRequestContentCache(key)).toBeNull();
		expect(readPullRequestRow(harness.db)).toMatchObject({ state: "merged" });
		expect(harness.refreshCalls).toEqual([["ws-newer", "ws-older"]]);
	});

	test("a PR nobody has checked out merges, gets its row written, and skips the refresh", async () => {
		const harness = await createHarness();

		await harness.caller.mergePR({
			projectId: PROJECT_ID,
			prNumber: UNLINKED_PR_NUMBER,
		});

		expect(harness.mergeCalls).toHaveLength(1);
		expect(readPullRequestRow(harness.db, "pr-43")).toMatchObject({
			state: "merged",
		});
		expect(harness.refreshCalls).toEqual([]);
	});

	test("a refused merge throws and refreshes nothing", async () => {
		const harness = await createHarness({
			merge: async () => {
				throw Object.assign(new Error("Pull Request is not mergeable"), {
					status: 405,
				});
			},
		});

		await expect(
			harness.caller.mergePR({ projectId: PROJECT_ID, prNumber: PR_NUMBER }),
		).rejects.toThrow();
		expect(harness.refreshCalls).toEqual([]);
	});

	test("a failed refresh still reports the merge as done", async () => {
		const harness = await createHarness({
			refresh: async () => {
				throw new Error("gh timed out");
			},
		});

		const result = await harness.caller.mergePR({
			projectId: PROJECT_ID,
			prNumber: PR_NUMBER,
		});

		expect(result.merged).toBe(true);
		expect(readPullRequestRow(harness.db)).toMatchObject({ state: "merged" });
		expect(harness.refreshCalls).toEqual([["ws-newer", "ws-older"]]);
		expect(warn).toHaveBeenCalledTimes(1);
	});
});
