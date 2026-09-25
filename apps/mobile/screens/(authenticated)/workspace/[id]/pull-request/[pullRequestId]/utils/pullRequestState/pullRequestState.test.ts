import { describe, expect, test } from "bun:test";
import type {
	PullRequestCheck,
	PullRequestDetail,
} from "../../../../utils/pullRequest/types";
import {
	resolveActions,
	resolveCardRows,
	resolvePullRequestState,
} from "./pullRequestState";

function check(overrides: Partial<PullRequestCheck> = {}): PullRequestCheck {
	return {
		name: "CI / Check",
		status: "COMPLETED",
		conclusion: "SUCCESS",
		isRequired: false,
		startedAt: null,
		completedAt: null,
		detailsUrl: null,
		...overrides,
	};
}

const failing = () => check({ conclusion: "FAILURE" });
const running = () => check({ status: "IN_PROGRESS", conclusion: null });

function detail(overrides: {
	pullRequest?: Partial<PullRequestDetail["pullRequest"]>;
	checks?: PullRequestCheck[];
	reviewers?: PullRequestDetail["reviewers"];
	mergeability?: Partial<PullRequestDetail["mergeability"]>;
	capabilities?: Partial<PullRequestDetail["capabilities"]>;
}): PullRequestDetail {
	return {
		pullRequest: {
			id: "pr-1",
			number: 1,
			title: "A pull request",
			body: "",
			url: "https://github.com/superset-sh/superset/pull/1",
			baseBranch: "main",
			state: "open",
			isDraft: false,
			additions: 1,
			deletions: 0,
			changedFiles: 1,
			mergedAt: null,
			mergedBy: null,
			...overrides.pullRequest,
		},
		checks: overrides.checks ?? [],
		reviewers: overrides.reviewers ?? [],
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
			...overrides.mergeability,
		},
		capabilities: {
			merge: true,
			markReady: true,
			updateBranch: false,
			reopen: true,
			dequeue: true,
			...overrides.capabilities,
		},
	};
}

const merged = () =>
	detail({
		pullRequest: {
			state: "merged",
			mergedAt: new Date("2026-08-15T22:25:00Z"),
			mergedBy: { login: "saddlepaddle", avatarUrl: null },
		},
		checks: [check(), failing()],
		reviewers: [
			{ login: "Kitenite", avatarUrl: null, isTeam: false, state: "APPROVED" },
		],
		mergeability: { approvals: 1, requiredApprovals: 1 },
	});

describe("resolvePullRequestState", () => {
	test("a failed check wins over ones still running", () => {
		const state = resolvePullRequestState(
			detail({ checks: [check(), failing(), running()] }),
		);
		expect(state).toBe("checks-failed");
	});

	test("merged wins over everything, failing checks included", () => {
		expect(resolvePullRequestState(merged())).toBe("merged");
	});

	test("running checks without failures wait", () => {
		const state = resolvePullRequestState(
			detail({ checks: [check(), running()] }),
		);
		expect(state).toBe("waiting-for-checks");
	});
});

describe("resolveActions", () => {
	test("draft with failed checks offers Mark Ready and the agent fix", () => {
		const prDetail = detail({
			pullRequest: { isDraft: true },
			checks: [failing(), running()],
			capabilities: { merge: false },
		});
		const state = resolvePullRequestState(prDetail);
		expect(resolveActions(state, prDetail)).toEqual([
			"mark-ready",
			"ask-fix-checks",
		]);
	});

	test("draft with failed checks but no markReady still offers the agent fix", () => {
		const prDetail = detail({
			pullRequest: { isDraft: true },
			checks: [failing()],
			capabilities: { merge: false, markReady: false },
		});
		expect(resolveActions("checks-failed", prDetail)).toEqual([
			"ask-fix-checks",
		]);
	});

	test("draft with conflicts offers only Mark Ready", () => {
		const prDetail = detail({
			pullRequest: { isDraft: true },
			mergeability: { mergeStateStatus: "DIRTY", mergeable: "CONFLICTING" },
			capabilities: { merge: false },
		});
		expect(resolveActions("conflicts", prDetail)).toEqual(["mark-ready"]);
	});

	test("draft with changes requested offers only Mark Ready", () => {
		const prDetail = detail({
			pullRequest: { isDraft: true },
			reviewers: [
				{
					login: "Kitenite",
					avatarUrl: null,
					isTeam: false,
					state: "CHANGES_REQUESTED",
				},
			],
			capabilities: { merge: false },
		});
		expect(resolveActions("changes-requested", prDetail)).toEqual([
			"mark-ready",
		]);
	});

	test("open PR with failed checks keeps merge and adds the agent fix", () => {
		const prDetail = detail({ checks: [failing()] });
		expect(resolveActions("checks-failed", prDetail)).toEqual([
			"merge",
			"ask-fix-checks",
		]);
	});

	test("waiting for review removes merge, never CI", () => {
		const prDetail = detail({
			reviewers: [
				{
					login: "Kitenite",
					avatarUrl: null,
					isTeam: false,
					state: "REQUESTED",
				},
			],
			mergeability: { reviewDecision: "REVIEW_REQUIRED", requiredApprovals: 1 },
			capabilities: { updateBranch: true },
		});
		expect(resolveActions("waiting-for-review", prDetail)).toEqual([
			"update-branch",
		]);
	});

	test("merged has no actions", () => {
		expect(resolveActions("merged", merged())).toEqual([]);
	});

	test("closed offers reopen when allowed", () => {
		expect(resolveActions("closed", detail({}))).toEqual(["reopen"]);
		expect(
			resolveActions("closed", detail({ capabilities: { reopen: false } })),
		).toEqual([]);
	});
});

describe("resolveCardRows", () => {
	test("merged keeps only the receipt, whatever checks and reviewers say", () => {
		expect(resolveCardRows("merged", merged())).toEqual(["merged-by"]);
	});

	test("merged without a known merger shows no rows", () => {
		const prDetail = merged();
		prDetail.pullRequest.mergedBy = null;
		expect(resolveCardRows("merged", prDetail)).toEqual([]);
	});

	test("closed drops the status rows", () => {
		const prDetail = detail({
			pullRequest: { state: "closed" },
			checks: [check()],
			reviewers: [
				{
					login: "Kitenite",
					avatarUrl: null,
					isTeam: false,
					state: "REQUESTED",
				},
			],
			mergeability: { requiredApprovals: 1 },
		});
		expect(resolveCardRows("closed", prDetail)).toEqual([]);
	});

	test("running checks with nobody assigned still shows both rows", () => {
		const prDetail = detail({
			checks: [check(), running()],
			mergeability: { requiredApprovals: 1 },
		});
		expect(resolveCardRows("waiting-for-checks", prDetail)).toEqual([
			"checks",
			"reviewers",
		]);
	});

	test("a failed check with others running keeps both rows on a draft (PR #6649 screenshot)", () => {
		const prDetail = detail({
			pullRequest: { isDraft: true },
			checks: [check(), failing(), running()],
			mergeability: { requiredApprovals: 1 },
		});
		expect(resolveCardRows("checks-failed", prDetail)).toEqual([
			"checks",
			"reviewers",
		]);
	});

	test("nothing to report means no rows at all", () => {
		const prDetail = detail({});
		expect(resolveCardRows("ready", prDetail)).toEqual([]);
		expect(resolveActions("ready", prDetail)).toEqual(["merge"]);
	});
});
