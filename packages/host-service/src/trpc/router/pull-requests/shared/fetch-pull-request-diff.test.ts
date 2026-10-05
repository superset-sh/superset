import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { HostServiceContext } from "../../../../types";
import { createCallerFactory, router } from "../../../index";
import * as projects from "../../workspace-creation/shared/project-helpers";
import * as gh from "../../workspace-creation/utils/exec-gh";
import { getDiff } from "../procedures/get-diff";
import { getDiffByRepo } from "../procedures/get-diff-by-repo";
import { fetchPullRequestDiff } from "./fetch-pull-request-diff";
import * as gitDiff from "./fetch-pull-request-git-diff";

afterEach(() => mock.restore());

test("project and repository endpoints share a case-insensitive in-flight cache", async () => {
	let resolve!: (patch: string) => void;
	const exec = spyOn(gh, "execGh").mockImplementation(
		() =>
			new Promise<string>((done) => {
				resolve = done;
			}),
	);
	spyOn(projects, "resolveGithubRepo").mockResolvedValue({
		owner: "Owner",
		name: "Shared",
		repoPath: "/unused",
	});
	const caller = createCallerFactory(router({ getDiff, getDiffByRepo }))({
		isAuthenticated: true,
	} as HostServiceContext);
	const byProject = caller.getDiff({ projectId: "project", prNumber: 81 });
	const byRepo = caller.getDiffByRepo({
		repoFullName: "owner/shared",
		prNumber: 81,
	});
	await new Promise((done) => setTimeout(done, 0));
	expect(exec).toHaveBeenCalledTimes(1);
	resolve("patch");
	expect(await Promise.all([byProject, byRepo])).toEqual([
		{ patch: "patch" },
		{ patch: "patch" },
	]);
	expect(
		await caller.getDiffByRepo({ repoFullName: "OWNER/SHARED", prNumber: 81 }),
	).toEqual({ patch: "patch" });
	expect(exec).toHaveBeenCalledTimes(1);
});

test("expires cached diffs after 30 seconds", async () => {
	const now = spyOn(Date, "now").mockReturnValue(100_000);
	const exec = spyOn(gh, "execGh").mockResolvedValue("first");
	expect(await fetchPullRequestDiff("owner/expiry", 1)).toEqual({
		patch: "first",
	});
	now.mockReturnValue(129_999);
	expect(await fetchPullRequestDiff("owner/expiry", 1)).toEqual({
		patch: "first",
	});
	expect(exec).toHaveBeenCalledTimes(1);
	now.mockReturnValue(130_000);
	exec.mockResolvedValue("updated");
	expect(await fetchPullRequestDiff("owner/expiry", 1)).toEqual({
		patch: "updated",
	});
	expect(exec).toHaveBeenCalledTimes(2);
});

test("evicts failures so the next request retries", async () => {
	const exec = spyOn(gh, "execGh").mockRejectedValue(new Error("offline"));
	await expect(fetchPullRequestDiff("owner/retry", 1)).rejects.toThrow(
		"offline",
	);
	exec.mockResolvedValue("recovered");
	expect(await fetchPullRequestDiff("owner/retry", 1)).toEqual({
		patch: "recovered",
	});
	expect(exec).toHaveBeenCalledTimes(2);
});

test("keeps repositories and PR numbers separate", async () => {
	const exec = spyOn(gh, "execGh").mockResolvedValue("patch");
	await Promise.all([
		fetchPullRequestDiff("owner/one", 2),
		fetchPullRequestDiff("owner/two", 2),
		fetchPullRequestDiff("owner/one", 3),
	]);
	expect(exec).toHaveBeenCalledTimes(3);
});

test("preserves the legacy patch without invoking the Git fallback", async () => {
	const patch =
		"diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-old\n+new\n";
	spyOn(gh, "execGh").mockResolvedValue(patch);
	const fallback = spyOn(gitDiff, "fetchPullRequestGitDiff").mockResolvedValue(
		"fallback",
	);
	expect(await fetchPullRequestDiff("owner/legacy-patch", 1)).toEqual({
		patch: patch,
	});
	expect(fallback).not.toHaveBeenCalled();
});

test("preserves a successful empty legacy diff", async () => {
	spyOn(gh, "execGh").mockResolvedValue("");
	const fallback = spyOn(gitDiff, "fetchPullRequestGitDiff").mockResolvedValue(
		"fallback",
	);
	expect(await fetchPullRequestDiff("owner/legacy-empty", 1)).toEqual({
		patch: "",
	});
	expect(fallback).not.toHaveBeenCalled();
});

test.each([
	"GraphQL: PullRequest.diff too_large",
	"HTTP 406: diff exceeded the maximum number of lines",
])("uses Git for a size-limited diff: %s", async (message) => {
	spyOn(gh, "execGh").mockRejectedValue(new Error(message));
	const fallback = spyOn(gitDiff, "fetchPullRequestGitDiff").mockResolvedValue(
		"complete patch",
	);
	const prNumber = message.startsWith("GraphQL") ? 1 : 2;
	expect(await fetchPullRequestDiff("owner/large-diff", prNumber)).toEqual({
		patch: "complete patch",
	});
	expect(fallback).toHaveBeenCalledWith("owner/large-diff", prNumber);
	expect(await fetchPullRequestDiff("OWNER/LARGE-DIFF", prNumber)).toEqual({
		patch: "complete patch",
	});
	expect(fallback).toHaveBeenCalledTimes(1);
});

test.each([
	"HTTP 401: Bad credentials",
	"HTTP 404: Not Found",
	"HTTP 429: API rate limit exceeded",
	"network connection lost",
])("preserves non-size errors without fetching Git objects: %s", async (message) => {
	const error = new Error(message);
	spyOn(gh, "execGh").mockRejectedValue(error);
	const fallback = spyOn(gitDiff, "fetchPullRequestGitDiff").mockResolvedValue(
		"fallback",
	);
	await expect(fetchPullRequestDiff("owner/unchanged-errors", 1)).rejects.toBe(
		error,
	);
	expect(fallback).not.toHaveBeenCalled();
});

test("evicts a failed Git fallback so a retry can recover", async () => {
	spyOn(gh, "execGh").mockRejectedValue(
		new Error("PullRequest.diff too_large"),
	);
	const fallback = spyOn(gitDiff, "fetchPullRequestGitDiff").mockRejectedValue(
		new Error("fetch failed"),
	);
	await expect(fetchPullRequestDiff("owner/git-retry", 1)).rejects.toThrow(
		"fetch failed",
	);
	fallback.mockResolvedValue("recovered patch");
	expect(await fetchPullRequestDiff("owner/git-retry", 1)).toEqual({
		patch: "recovered patch",
	});
	expect(fallback).toHaveBeenCalledTimes(2);
});

test("shares slow in-flight requests and starts their TTL when they finish", async () => {
	const now = spyOn(Date, "now").mockReturnValue(200_000);
	let resolve!: (patch: string) => void;
	const exec = spyOn(gh, "execGh").mockImplementation(
		() =>
			new Promise<string>((done) => {
				resolve = done;
			}),
	);
	const first = fetchPullRequestDiff("owner/slow-fetch", 1);
	now.mockReturnValue(260_000);
	const second = fetchPullRequestDiff("OWNER/SLOW-FETCH", 1);
	expect(exec).toHaveBeenCalledTimes(1);
	resolve("slow patch");
	expect(await Promise.all([first, second])).toEqual([
		{ patch: "slow patch" },
		{ patch: "slow patch" },
	]);
	now.mockReturnValue(289_999);
	expect(await fetchPullRequestDiff("owner/slow-fetch", 1)).toEqual({
		patch: "slow patch",
	});
	expect(exec).toHaveBeenCalledTimes(1);
	now.mockReturnValue(290_000);
	exec.mockResolvedValue("fresh patch");
	expect(await fetchPullRequestDiff("owner/slow-fetch", 1)).toEqual({
		patch: "fresh patch",
	});
	expect(exec).toHaveBeenCalledTimes(2);
});

test("keeps in-flight requests shared when the cache reaches its limit", async () => {
	const resolvers: Array<(patch: string) => void> = [];
	const exec = spyOn(gh, "execGh").mockImplementation(
		() => new Promise<string>((resolve) => resolvers.push(resolve)),
	);
	const pending = Array.from({ length: 20 }, (_, index) =>
		fetchPullRequestDiff("owner/cache-pressure", index + 1),
	);
	pending.push(fetchPullRequestDiff("owner/cache-pressure", 21));
	pending.push(fetchPullRequestDiff("owner/cache-pressure", 1));
	expect(exec).toHaveBeenCalledTimes(21);
	for (const resolve of resolvers) resolve("patch");
	expect(await Promise.all(pending)).toEqual(
		Array(22).fill({ patch: "patch" }),
	);
});

test("uses complete API file patches before fetching Git objects", async () => {
	const metadata = {
		base: { sha: "a".repeat(40) },
		head: { sha: "b".repeat(40) },
		changed_files: 1,
		additions: 1,
		deletions: 1,
	};
	const exec = spyOn(gh, "execGh")
		.mockRejectedValueOnce(new Error("PullRequest.diff too_large"))
		.mockResolvedValueOnce(metadata)
		.mockResolvedValueOnce([
			{
				filename: "a.txt",
				status: "modified",
				additions: 1,
				deletions: 1,
				patch: "@@ -1 +1 @@\n-old\n+new",
			},
		])
		.mockResolvedValueOnce(metadata);
	const git = spyOn(gitDiff, "fetchPullRequestGitDiff").mockRejectedValue(
		new Error("must not fetch Git"),
	);
	const result = await fetchPullRequestDiff("owner/files-api", 1);
	expect(result.files).toEqual([{ filename: "a.txt", status: "modified" }]);
	expect(result.patch).toContain("-old\n+new");
	expect(exec.mock.calls.map((call) => call[0])).toEqual([
		["pr", "diff", "1", "--repo", "owner/files-api"],
		["api", "repos/owner/files-api/pulls/1"],
		["api", "repos/owner/files-api/pulls/1/files?per_page=100&page=1"],
		["api", "repos/owner/files-api/pulls/1"],
	]);
	expect(git).not.toHaveBeenCalled();
});

test("falls through to Git when the API omits file content", async () => {
	const metadata = {
		base: { sha: "a".repeat(40) },
		head: { sha: "b".repeat(40) },
		changed_files: 1,
		additions: 0,
		deletions: 0,
	};
	spyOn(gh, "execGh")
		.mockRejectedValueOnce(new Error("PullRequest.diff too_large"))
		.mockResolvedValueOnce(metadata)
		.mockResolvedValueOnce([
			{
				filename: "binary.png",
				status: "modified",
				additions: 0,
				deletions: 0,
			},
		]);
	const git = spyOn(gitDiff, "fetchPullRequestGitDiff").mockResolvedValue(
		"complete binary diff",
	);
	expect(await fetchPullRequestDiff("owner/binary-api", 1)).toEqual({
		patch: "complete binary diff",
	});
	expect(git).toHaveBeenCalledTimes(1);
});

test("shares an oversized pending diff but does not retain it after completion", async () => {
	spyOn(Date, "now").mockReturnValue(1_000_000);
	let resolve!: (patch: string) => void;
	const exec = spyOn(gh, "execGh").mockImplementation(
		() =>
			new Promise<string>((done) => {
				resolve = done;
			}),
	);
	const first = fetchPullRequestDiff("owner/oversized-cache", 1);
	expect(fetchPullRequestDiff("owner/oversized-cache", 1)).toBe(first);
	const patch = "x".repeat(16 * 1024 * 1024 + 1);
	resolve(patch);
	expect((await first).patch).toBe(patch);
	exec.mockResolvedValue("retry");
	expect(await fetchPullRequestDiff("owner/oversized-cache", 1)).toEqual({
		patch: "retry",
	});
	expect(exec).toHaveBeenCalledTimes(2);
});

test("evicts completed diffs to stay within the total 32 MiB cache budget", async () => {
	spyOn(Date, "now").mockReturnValue(2_000_000);
	const patch = "x".repeat(8 * 1024 * 1024);
	const exec = spyOn(gh, "execGh").mockResolvedValue(patch);
	await fetchPullRequestDiff("owner/byte-budget", 1);
	await fetchPullRequestDiff("owner/byte-budget", 2);
	await fetchPullRequestDiff("owner/byte-budget", 1);
	expect(exec).toHaveBeenCalledTimes(2);
	await fetchPullRequestDiff("owner/byte-budget", 3);
	await fetchPullRequestDiff("owner/byte-budget", 2);
	await fetchPullRequestDiff("owner/byte-budget", 3);
	expect(exec).toHaveBeenCalledTimes(3);
	await fetchPullRequestDiff("owner/byte-budget", 1);
	expect(exec).toHaveBeenCalledTimes(4);
});
