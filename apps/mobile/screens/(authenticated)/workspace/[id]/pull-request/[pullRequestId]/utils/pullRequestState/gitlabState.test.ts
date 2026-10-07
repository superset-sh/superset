import { expect, test } from "bun:test";
import {
	resolveGitLabActions as actions,
	resolveGitLabState as resolve,
} from "./gitlabState";

const detail = {
	provider: "gitlab",
	pullRequest: { state: "open", isDraft: false, mergedAt: null },
	checks: [],
	reviewers: [],
	mergeability: {
		mergeStateStatus: "CLEAN",
		mergeable: "MERGEABLE",
		queue: null,
		reviewDecision: null,
		approvals: 0,
		requiredApprovals: 0,
		requiresThreadResolution: false,
		unresolvedThreads: 0,
	},
	reviewState: {
		state: "opened",
		detailedMergeStatus: "mergeable",
		hasConflicts: false,
		blockingDiscussionsResolved: true,
		approvalsRequired: 0,
		approvalsLeft: 0,
	},
	capabilities: {
		merge: true,
		markReady: true,
		updateBranch: false,
		reopen: true,
		dequeue: true,
	},
};
test("native unknown approvals remain unknown and block merge", () => {
	const d = {
		...detail,
		reviewState: {
			...detail.reviewState,
			approvalsRequired: null,
			approvalsLeft: null,
			detailedMergeStatus: "unknown_state",
		},
	};
	expect(resolve(d)).toBe("approval-unknown");
	expect(actions(d)).not.toContain("merge");
});
test("native locked state has no actions", () => {
	const d = {
		...detail,
		reviewState: { ...detail.reviewState, state: "locked" },
	};
	expect(resolve(d)).toBe("locked");
	expect(actions(d)).toEqual([]);
});
test("native known mergeable requirements retain merge capability", () => {
	expect(resolve(detail)).toBe("ready");
	expect(actions(detail)).toEqual(["merge"]);
});
test("native rebase capability survives blocked state without queue", () => {
	const d = {
		...detail,
		reviewState: { ...detail.reviewState, detailedMergeStatus: "need_rebase" },
		capabilities: { ...detail.capabilities, updateBranch: true },
	};
	expect(resolve(d)).toBe("blocked");
	expect(actions(d)).toEqual(["update-branch"]);
});
test("native conflicts expose bound agent resolution", () => {
	const d = {
		...detail,
		reviewState: { ...detail.reviewState, hasConflicts: true },
	};
	expect(resolve(d)).toBe("conflicts");
	expect(actions(d)).toEqual(["ask-resolve-conflicts"]);
});
test("native unknown merge status remains blocked", () => {
	expect(
		resolve({
			...detail,
			reviewState: {
				...detail.reviewState,
				detailedMergeStatus: "unknown_state",
			},
		}),
	).toBe("blocked");
});

test("native terminated states retain actual capabilities without queue", () => {
	expect(
		actions({
			...detail,
			pullRequest: { ...detail.pullRequest, state: "merged" },
		}),
	).toEqual([]);
	expect(
		actions({
			...detail,
			pullRequest: { ...detail.pullRequest, state: "closed" },
		}),
	).toEqual(["reopen"]);
	expect(
		actions({
			...detail,
			pullRequest: { ...detail.pullRequest, state: "closed" },
			capabilities: { ...detail.capabilities, reopen: false },
		}),
	).toEqual([]);
	expect(
		actions({
			...detail,
			capabilities: { ...detail.capabilities, merge: false },
		}),
	).toEqual([]);
});
test("native checks keep failure, pending, ignored and action states distinct", () => {
	const check = { name: "CI", status: "COMPLETED", conclusion: "SUCCESS" };
	expect(
		resolve({ ...detail, checks: [{ ...check, conclusion: "FAILURE" }] }),
	).toBe("checks-failed");
	expect(
		resolve({
			...detail,
			checks: [{ ...check, conclusion: "ACTION_REQUIRED" }],
		}),
	).toBe("check-needs-action");
	expect(resolve({ ...detail, checks: [{ ...check, conclusion: null }] })).toBe(
		"waiting-for-checks",
	);
	expect(
		resolve({ ...detail, checks: [{ ...check, conclusion: "CANCELLED" }] }),
	).toBe("ready");
});
test("native incomplete discussion and review requirements remain blocked", () => {
	expect(
		resolve({
			...detail,
			reviewState: {
				...detail.reviewState,
				blockingDiscussionsResolved: false,
			},
		}),
	).toBe("unresolved-conversations");
	expect(
		resolve({
			...detail,
			reviewState: { ...detail.reviewState, approvalsLeft: 1 },
		}),
	).toBe("waiting-for-review");
	expect(
		resolve({
			...detail,
			reviewState: { ...detail.reviewState, detailedMergeStatus: "checking" },
		}),
	).toBe("checking");
});

test("native Free mergeable status permits merge while premium counts remain unknown", () => {
	const value = {
		...detail,
		reviewState: {
			...detail.reviewState,
			approvalsRequired: null,
			approvalsLeft: null,
		},
	};
	expect(resolve(value)).toBe("ready");
	expect(actions(value)).toEqual(["merge"]);
	expect(
		actions({
			...value,
			capabilities: { ...value.capabilities, merge: false },
		}),
	).not.toContain("merge");
	expect(
		resolve({
			...value,
			reviewState: {
				...value.reviewState,
				detailedMergeStatus: "not_approved",
			},
		}),
	).toBe("waiting-for-review");
});
