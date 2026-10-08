import { describe, expect, it } from "bun:test";
import type {
	BranchSyncStatus,
	PRFlowState,
	PullRequest,
} from "../getPRFlowState";
import { getShipMenuActions } from "./getShipMenuActions";

const sync = (overrides: Partial<BranchSyncStatus> = {}): BranchSyncStatus => ({
	hasRepo: true,
	hasUpstream: true,
	pushCount: 0,
	pullCount: 0,
	isDefaultBranch: false,
	isDetached: false,
	hasUncommitted: false,
	currentBranch: "feature-x",
	defaultBranch: "main",
	...overrides,
});

const pr = { number: 42, state: "open" } as PullRequest;

const cases: {
	name: string;
	flowState: PRFlowState;
	sync: BranchSyncStatus | null;
	workspaceCanCreatePr?: boolean;
	commitsLoaded?: boolean;
	expected: [commit: boolean, push: boolean, createPr: boolean];
}[] = [
	{
		name: "no remote with uncommitted changes offers only Commit",
		flowState: { kind: "unavailable", reason: "no-repo" },
		sync: sync({ hasRepo: false, hasUpstream: false, hasUncommitted: true }),
		expected: [true, false, false],
	},
	{
		name: "default branch never offers Push or Create PR",
		flowState: { kind: "unavailable", reason: "default-branch" },
		sync: sync({ isDefaultBranch: true, hasUncommitted: true, pushCount: 3 }),
		expected: [true, false, false],
	},
	{
		name: "detached HEAD offers nothing",
		flowState: { kind: "unavailable", reason: "detached-head" },
		sync: sync({ isDetached: true, hasUncommitted: true }),
		expected: [false, false, false],
	},
	{
		name: "unpublished branch with uncommitted changes holds Create PR back",
		flowState: {
			kind: "no-pr",
			sync: sync({ hasUpstream: false, hasUncommitted: true }),
		},
		sync: sync({ hasUpstream: false, hasUncommitted: true }),
		expected: [true, true, false],
	},
	{
		name: "clean branch ahead of its remote offers Push and Create PR",
		flowState: { kind: "no-pr", sync: sync({ pushCount: 2 }) },
		sync: sync({ pushCount: 2 }),
		expected: [false, true, true],
	},
	{
		name: "Create PR waits for the commits-ahead check",
		flowState: { kind: "no-pr", sync: sync() },
		sync: sync(),
		commitsLoaded: false,
		expected: [false, false, false],
	},
	{
		name: "session workspaces cannot create PRs",
		flowState: { kind: "no-pr", sync: sync() },
		sync: sync(),
		workspaceCanCreatePr: false,
		expected: [false, false, false],
	},
	{
		name: "an open PR still offers Commit and Push but not Create PR",
		flowState: {
			kind: "pr-exists",
			pr,
			sync: sync({ hasUncommitted: true, pushCount: 1 }),
		},
		sync: sync({ hasUncommitted: true, pushCount: 1 }),
		expected: [true, true, false],
	},
	{
		name: "nothing while the flow is loading",
		flowState: { kind: "loading" },
		sync: null,
		expected: [false, false, false],
	},
];

describe("getShipMenuActions", () => {
	for (const testCase of cases) {
		it(testCase.name, () => {
			const actions = getShipMenuActions({
				flowState: testCase.flowState,
				sync: testCase.sync,
				workspaceCanCreatePr: testCase.workspaceCanCreatePr ?? true,
				commitsLoaded: testCase.commitsLoaded ?? true,
			});
			expect([actions.canCommit, actions.canPush, actions.canCreatePr]).toEqual(
				testCase.expected,
			);
		});
	}
});
