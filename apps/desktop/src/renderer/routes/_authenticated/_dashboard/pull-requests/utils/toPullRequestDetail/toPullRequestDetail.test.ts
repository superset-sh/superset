import { expect, test } from "bun:test";
import { cloudPullRequestRead } from "./fixtures";
import { toPullRequestDetail } from "./toPullRequestDetail";

test("maps GitHub's vocabulary, keeping the latest run of each check", () => {
	const read = {
		...cloudPullRequestRead(),
		checks: [
			{
				name: "ci",
				status: "COMPLETED",
				conclusion: "FAILURE",
				isRequired: true,
				startedAt: "2026-10-01T10:00:00Z",
				completedAt: "2026-10-01T10:05:00Z",
				detailsUrl: "https://ci/1",
			},
			{
				name: "ci",
				status: "COMPLETED",
				conclusion: "SUCCESS",
				isRequired: true,
				startedAt: "2026-10-01T11:00:00Z",
				completedAt: "2026-10-01T11:05:00Z",
				detailsUrl: "https://ci/2",
			},
			{
				name: "lint",
				status: "IN_PROGRESS",
				conclusion: null,
				isRequired: false,
				startedAt: null,
				completedAt: null,
				detailsUrl: null,
			},
		],
		reviewers: [
			{ login: "maya", avatarUrl: null, isTeam: false, state: "APPROVED" },
		],
		mergeability: {
			...cloudPullRequestRead().mergeability,
			mergeable: "CONFLICTING",
			reviewDecision: "CHANGES_REQUESTED",
		},
		activity: {
			author: { login: "satya", avatarUrl: "a" },
			headBranch: "feat/x",
			headRepoFullName: "fork/repo",
			createdAt: "2026-10-01T09:00:00Z",
			updatedAt: "2026-10-02T09:00:00Z",
			closedAt: null,
			labels: [{ name: "desktop", color: "1d76db" }],
			comments: [],
			commits: [],
		},
	};
	expect(toPullRequestDetail(read, "owner/repo")).toMatchObject({
		repoFullName: "owner/repo",
		head: { ref: "feat/x", repoFullName: "fork/repo" },
		author: { login: "satya", avatarUrl: "a" },
		checks: [
			{ name: "ci", status: "success", url: "https://ci/2" },
			{ name: "lint", status: "pending", url: null },
		],
		checksStatus: "pending",
		reviewDecision: "changes_requested",
		mergeability: "conflicting",
		reviewers: [{ login: "maya", name: null }],
		labels: [{ name: "desktop", color: "1d76db" }],
	});
});
