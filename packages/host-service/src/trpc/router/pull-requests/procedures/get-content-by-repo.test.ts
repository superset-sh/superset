import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../../../../types";
import { createCallerFactory, router } from "../../../index";
import * as projects from "../../workspace-creation/shared/project-helpers";
import * as gh from "../../workspace-creation/utils/exec-gh";
import { PULL_REQUEST_CONTENT_JSON_FIELDS } from "../shared/fetch-pull-request-content";
import { evictPullRequestContent } from "../shared/pull-request-content-cache";
import { getContent } from "./get-content";
import { getContentByRepo } from "./get-content-by-repo";

const createCaller = createCallerFactory(
	router({ getContent, getContentByRepo }),
);
const caller = createCaller({ isAuthenticated: true } as HostServiceContext);
const rawContent = {
	number: 12,
	title: "Fix the fallback",
	body: null,
	url: "https://github.com/owner/repo/pull/12",
	state: "OPEN",
	headRefName: "fix/fallback",
	baseRefName: "main",
	headRepositoryOwner: null,
	isCrossRepository: false,
	isDraft: false,
	statusCheckRollup: null,
};
const expectedContent = {
	number: 12,
	title: "Fix the fallback",
	body: "",
	url: "https://github.com/owner/repo/pull/12",
	state: "open",
	branch: "fix/fallback",
	baseBranch: "main",
	headRepositoryOwner: null,
	isCrossRepository: false,
	author: null,
	isDraft: false,
	createdAt: undefined,
	updatedAt: undefined,
	checks: [],
	checksStatus: "none" as const,
	mergedAt: null,
	closedAt: null,
	mergeability: "unknown" as const,
	mergeStateStatus: null,
	additions: 0,
	deletions: 0,
	changedFiles: 0,
	reviewDecision: null,
	reviewers: [],
	comments: [],
	labels: [],
};

afterEach(() => mock.restore());

test("reads repository content without a project and preserves the legacy output", async () => {
	const exec = spyOn(gh, "execGh").mockResolvedValue(rawContent);
	const resolve = spyOn(projects, "resolveGithubRepo");
	expect(
		await caller.getContentByRepo({
			repoFullName: "owner/direct",
			prNumber: 12,
		}),
	).toEqual(expectedContent);
	expect(resolve).not.toHaveBeenCalled();
	expect(exec).toHaveBeenCalledWith([
		"pr",
		"view",
		"12",
		"--repo",
		"owner/direct",
		"--json",
		PULL_REQUEST_CONTENT_JSON_FIELDS,
	]);
});

test("project and repository reads reuse the same in-flight request and mutation invalidation", async () => {
	let resolve!: (value: typeof rawContent) => void;
	const exec = spyOn(gh, "execGh").mockImplementation(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	spyOn(projects, "resolveGithubRepo").mockResolvedValue({
		owner: "Owner",
		name: "SharedContent",
		repoPath: "/unused",
	});
	const byProject = caller.getContent({ projectId: "project", prNumber: 12 });
	const byRepo = caller.getContentByRepo({
		repoFullName: "owner/sharedcontent",
		prNumber: 12,
	});
	await new Promise((done) => setTimeout(done, 0));
	expect(exec).toHaveBeenCalledTimes(1);
	resolve(rawContent);
	expect(await Promise.all([byProject, byRepo])).toEqual([
		expectedContent,
		expectedContent,
	]);
	expect(
		await caller.getContentByRepo({
			repoFullName: "OWNER/SHAREDCONTENT",
			prNumber: 12,
		}),
	).toEqual(expectedContent);
	expect(exec).toHaveBeenCalledTimes(1);
	evictPullRequestContent({ owner: "owner", name: "sharedcontent" }, 12);
	exec.mockResolvedValue({ ...rawContent, state: "MERGED" });
	expect(
		await caller.getContent({ projectId: "project", prNumber: 12 }),
	).toMatchObject({ state: "merged" });
	expect(exec).toHaveBeenCalledTimes(2);
});

test("rejects malformed repository names and PR numbers before executing gh", async () => {
	const exec = spyOn(gh, "execGh").mockResolvedValue(rawContent);
	for (const repoFullName of [
		"repo",
		"owner/repo/extra",
		"--repo other/repo",
		"/repo",
		"owner/",
	]) {
		await expect(
			caller.getContentByRepo({ repoFullName, prNumber: 12 }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	}
	for (const prNumber of [0, -1, 1.5]) {
		await expect(
			caller.getContentByRepo({ repoFullName: "owner/repo", prNumber }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	}
	expect(exec).not.toHaveBeenCalled();
});

test("requires host authentication", async () => {
	const exec = spyOn(gh, "execGh").mockResolvedValue(rawContent);
	const unauthenticated = createCaller({
		isAuthenticated: false,
	} as HostServiceContext);
	await expect(
		unauthenticated.getContentByRepo({
			repoFullName: "owner/repo",
			prNumber: 12,
		}),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	expect(exec).not.toHaveBeenCalled();
});

test("preserves gh failure codes and evicts failures so a later read can retry", async () => {
	const exec = spyOn(gh, "execGh").mockRejectedValue(
		new Error("gh not authenticated"),
	);
	await expect(
		caller.getContentByRepo({
			repoFullName: "owner/retrycontent",
			prNumber: 12,
		}),
	).rejects.toMatchObject({
		code: "INTERNAL_SERVER_ERROR",
		message: "Failed to fetch PR #12: gh not authenticated",
	});
	exec.mockResolvedValue(rawContent);
	expect(
		await caller.getContentByRepo({
			repoFullName: "owner/retrycontent",
			prNumber: 12,
		}),
	).toEqual(expectedContent);
	expect(exec).toHaveBeenCalledTimes(2);
});

test("preserves the legacy project resolver error contract", async () => {
	const exec = spyOn(gh, "execGh").mockResolvedValue(rawContent);
	spyOn(projects, "resolveGithubRepo").mockRejectedValue(
		new TRPCError({ code: "NOT_FOUND", message: "Project not found" }),
	);
	await expect(
		caller.getContent({ projectId: "missing", prNumber: 12 }),
	).rejects.toMatchObject({ code: "NOT_FOUND", message: "Project not found" });
	expect(exec).not.toHaveBeenCalled();
});

test("normalizes reviewers and comments from a populated gh payload", async () => {
	spyOn(gh, "execGh").mockResolvedValue({
		...rawContent,
		author: { login: "octocat", name: "The Octocat" },
		mergeable: "UNKNOWN",
		mergeStateStatus: "UNSTABLE",
		additions: 12,
		deletions: -3,
		changedFiles: 2.7,
		reviewDecision: "CHANGES_REQUESTED",
		reviewRequests: [
			{ login: "Reviewer", name: "Rae Viewer" },
			{ __typename: "Team", name: "core", slug: "core" },
		],
		reviews: [
			{
				id: "R1",
				author: { login: "reviewer" },
				body: "Please fix",
				state: "CHANGES_REQUESTED",
				submittedAt: "2026-10-01T10:00:00Z",
			},
			{
				id: "R2",
				author: { login: "pending" },
				body: "",
				state: "PENDING",
				submittedAt: null,
			},
		],
		comments: [
			{
				id: "C1",
				author: null,
				body: "Ghost says hi",
				createdAt: "2026-10-01T09:00:00Z",
				url: "https://github.com/owner/repo/pull/12#issuecomment-1",
			},
			{ id: "C2", author: { login: "late" }, body: "no time", createdAt: null },
		],
		labels: [{ name: "bug", color: "" }],
	});
	const content = await caller.getContentByRepo({
		repoFullName: "owner/populated",
		prNumber: 12,
	});
	expect(content).toMatchObject({
		author: "octocat",
		mergeability: "unknown",
		mergeStateStatus: "UNSTABLE",
		additions: 12,
		deletions: 0,
		changedFiles: 2,
		reviewDecision: "CHANGES_REQUESTED",
		reviewers: [{ login: "reviewer", name: null }],
		labels: [{ name: "bug", color: null }],
	});
	expect(content.comments).toEqual([
		{
			id: "C1",
			kind: "comment",
			author: null,
			body: "Ghost says hi",
			createdAt: "2026-10-01T09:00:00Z",
			reviewState: null,
			url: "https://github.com/owner/repo/pull/12#issuecomment-1",
		},
		{
			id: "R1",
			kind: "review",
			author: { login: "reviewer", name: null },
			body: "Please fix",
			createdAt: "2026-10-01T10:00:00Z",
			reviewState: "CHANGES_REQUESTED",
			url: null,
		},
	]);
});
