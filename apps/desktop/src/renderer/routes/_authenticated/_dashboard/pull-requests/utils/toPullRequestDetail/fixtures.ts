import type { PullRequestDetailRead } from "@superset/shared/pull-request-detail";

export function cloudPullRequestRead(
	overrides: Partial<PullRequestDetailRead["pullRequest"]> = {},
): PullRequestDetailRead {
	return {
		pullRequest: {
			id: "PR_1",
			number: 12,
			title: "cloud title",
			body: "",
			url: "https://github.com/owner/repo/pull/12",
			baseBranch: "main",
			state: "open",
			isDraft: false,
			additions: 3,
			deletions: 1,
			changedFiles: 2,
			mergedAt: null,
			mergedBy: null,
			...overrides,
		},
		checks: [],
		reviewers: [],
		mergeability: {
			mergeable: "MERGEABLE",
			mergeStateStatus: "CLEAN",
			approvals: 0,
			requiredApprovals: 0,
			reviewDecision: null,
			unresolvedThreads: 0,
			requiresThreadResolution: false,
			queue: null,
			allowedMergeMethods: ["squash"],
		},
		capabilities: {
			update: true,
			merge: true,
			markReady: false,
			updateBranch: false,
			reopen: false,
			dequeue: false,
		},
		activity: null,
	};
}
