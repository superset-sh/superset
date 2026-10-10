import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";
import type { HostServiceContext } from "../../../../types";
import {
	pullRequestContentCacheKey,
	readPullRequestContentCache,
	writePullRequestContentCache,
} from "./pull-request-content-cache";
import { syncPullRequestAfterWrite } from "./sync-after-write";
import {
	createTestDb,
	PR_NUMBER,
	REPO,
	readPullRequestRow,
	seedDuplicateCasingRow,
	seedLinkedPullRequest,
	UNLINKED_PR_NUMBER,
} from "./test-db";

function createContext(
	db: HostServiceContext["db"],
	refreshPullRequestsByWorkspaces: (ids: string[]) => Promise<void>,
): Pick<HostServiceContext, "db" | "runtime"> {
	return {
		db,
		runtime: { pullRequests: { refreshPullRequestsByWorkspaces } },
	} as unknown as Pick<HostServiceContext, "db" | "runtime">;
}

function recordingContext(db: HostServiceContext["db"]) {
	const refreshed: string[][] = [];
	const ctx = createContext(db, async (ids) => {
		refreshed.push(ids);
	});
	return { ctx, refreshed };
}

describe("syncPullRequestAfterWrite", () => {
	const warn = spyOn(console, "warn").mockImplementation(() => {});

	afterEach(() => {
		warn.mockClear();
	});

	afterAll(() => {
		warn.mockRestore();
	});

	test("evicts the cached content, records the merge, then refreshes the linked workspaces", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		const key = pullRequestContentCacheKey(REPO, PR_NUMBER);
		writePullRequestContentCache(key, Promise.resolve({ state: "open" }));
		const { ctx, refreshed } = recordingContext(db);

		await syncPullRequestAfterWrite(ctx, {
			repo: REPO,
			prNumber: PR_NUMBER,
			action: "merge",
		});

		expect(readPullRequestContentCache(key)).toBeNull();
		expect(readPullRequestRow(db)).toMatchObject({ state: "merged" });
		expect(readPullRequestRow(db)?.mergedAt).toBeGreaterThan(0);
		expect(refreshed).toEqual([["ws-newer", "ws-older"]]);
		expect(warn).not.toHaveBeenCalled();
	});

	test("records close, and reopen keeps a draft a draft", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db, "/tmp/repo", { isDraft: true });
		const { ctx } = recordingContext(db);

		await syncPullRequestAfterWrite(ctx, {
			repo: REPO,
			prNumber: PR_NUMBER,
			action: "close",
		});
		expect(readPullRequestRow(db)).toMatchObject({
			state: "closed",
			mergedAt: null,
		});

		await syncPullRequestAfterWrite(ctx, {
			repo: REPO,
			prNumber: PR_NUMBER,
			action: "reopen",
		});
		expect(readPullRequestRow(db)).toMatchObject({ state: "draft" });
	});

	test("ready clears the draft flag and draft sets it back", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db, "/tmp/repo", { isDraft: true });
		const { ctx } = recordingContext(db);

		await syncPullRequestAfterWrite(ctx, {
			repo: REPO,
			prNumber: PR_NUMBER,
			action: "ready",
		});
		expect(readPullRequestRow(db)).toMatchObject({
			state: "open",
			isDraft: false,
		});

		await syncPullRequestAfterWrite(ctx, {
			repo: REPO,
			prNumber: PR_NUMBER,
			action: "draft",
		});
		expect(readPullRequestRow(db)).toMatchObject({
			state: "draft",
			isDraft: true,
		});
	});

	test("finds the row when a sibling project on the same repository owns it", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db, "/tmp/repo", { rowProjectId: "other-project" });
		const { ctx, refreshed } = recordingContext(db);

		await syncPullRequestAfterWrite(ctx, {
			repo: REPO,
			prNumber: PR_NUMBER,
			action: "merge",
		});

		expect(readPullRequestRow(db)).toMatchObject({ state: "merged" });
		expect(refreshed).toEqual([["ws-newer", "ws-older"]]);
	});

	test("writes every row for a repository spelled two ways and refreshes all their workspaces", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		seedDuplicateCasingRow(db);
		const { ctx, refreshed } = recordingContext(db);

		await syncPullRequestAfterWrite(ctx, {
			repo: REPO,
			prNumber: PR_NUMBER,
			action: "merge",
		});

		expect(readPullRequestRow(db, "pr-42")).toMatchObject({ state: "merged" });
		expect(readPullRequestRow(db, "pr-42-dup")).toMatchObject({
			state: "merged",
		});
		expect(refreshed).toEqual([["ws-dup", "ws-newer", "ws-older"]]);
	});

	test("writes the row but skips the refresh when no live workspace is linked", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		const { ctx, refreshed } = recordingContext(db);

		await syncPullRequestAfterWrite(ctx, {
			repo: REPO,
			prNumber: UNLINKED_PR_NUMBER,
			action: "close",
		});

		expect(readPullRequestRow(db, "pr-43")).toMatchObject({ state: "closed" });
		expect(refreshed).toEqual([]);
	});

	test("evicts the cached content, and nothing else, for a PR the host has never seen", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		const key = pullRequestContentCacheKey(REPO, 99);
		writePullRequestContentCache(key, Promise.resolve({ state: "open" }));
		const { ctx, refreshed } = recordingContext(db);

		await syncPullRequestAfterWrite(ctx, {
			repo: REPO,
			prNumber: 99,
			action: "merge",
		});

		expect(readPullRequestContentCache(key)).toBeNull();
		expect(refreshed).toEqual([]);
		expect(warn).not.toHaveBeenCalled();
	});

	test("a failed refresh is logged, not thrown, and the row keeps the written state", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);

		await syncPullRequestAfterWrite(
			createContext(db, async () => {
				throw new Error("gh timed out");
			}),
			{ repo: REPO, prNumber: PR_NUMBER, action: "merge" },
		);

		expect(readPullRequestRow(db)).toMatchObject({ state: "merged" });
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0]?.[0])).toContain("[pull-requests:merge]");
		expect(warn.mock.calls[0]?.[1]).toMatchObject({
			repo: "octocat/hello",
			prNumber: PR_NUMBER,
			workspaceIds: ["ws-newer", "ws-older"],
		});
	});

	test("a database failure after the write is logged, not thrown", async () => {
		const brokenDb = new Proxy(
			{},
			{
				get() {
					throw new Error("database closed");
				},
			},
		) as unknown as HostServiceContext["db"];

		await expect(
			syncPullRequestAfterWrite(
				createContext(brokenDb, async () => {}),
				{
					repo: REPO,
					prNumber: PR_NUMBER,
					action: "close",
				},
			),
		).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalledTimes(1);
	});
});
