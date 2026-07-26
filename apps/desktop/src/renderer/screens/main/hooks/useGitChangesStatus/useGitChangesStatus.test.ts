import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { GitChangesStatus } from "shared/changes-types";

const status: GitChangesStatus = {
	branch: "feature",
	defaultBranch: "release",
	againstBase: [],
	commits: [],
	totalCommitCount: 0,
	staged: [],
	unstaged: [],
	untracked: [],
	ahead: 0,
	behind: 0,
	pushCount: 0,
	pullCount: 0,
	hasUpstream: true,
};

let branchQueryResult: { data?: unknown } = {};
let statusQueryResult: {
	data?: GitChangesStatus;
	isLoading: boolean;
	refetch: () => Promise<void>;
};

const getBranchesUseQuery = mock(
	(_input: unknown, _options: unknown) => branchQueryResult,
);
const getStatusUseQuery = mock(
	(_input: unknown, _options: unknown) => statusQueryResult,
);

mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		changes: {
			getBranches: { useQuery: getBranchesUseQuery },
			getStatus: { useQuery: getStatusUseQuery },
		},
	},
}));

const { GIT_CHANGES_QUERY_GC_TIME_MS, useGitChangesStatus } = await import(
	"./useGitChangesStatus"
);

describe("useGitChangesStatus", () => {
	beforeEach(() => {
		branchQueryResult = {};
		statusQueryResult = {
			isLoading: true,
			refetch: async () => {},
		};
		getBranchesUseQuery.mockClear();
		getStatusUseQuery.mockClear();
	});

	test("starts branch and status queries together on a cold workspace", () => {
		useGitChangesStatus({ worktreePath: "/worktrees/one" });

		expect(getBranchesUseQuery).toHaveBeenCalledWith(
			{ worktreePath: "/worktrees/one" },
			expect.objectContaining({
				enabled: true,
				gcTime: GIT_CHANGES_QUERY_GC_TIME_MS,
			}),
		);
		expect(getStatusUseQuery).toHaveBeenCalledWith(
			{ worktreePath: "/worktrees/one" },
			expect.objectContaining({
				enabled: true,
				gcTime: GIT_CHANGES_QUERY_GC_TIME_MS,
			}),
		);
	});

	test("keeps exact-worktree cached status visible during a refresh", () => {
		statusQueryResult = {
			data: status,
			isLoading: true,
			refetch: async () => {},
		};

		const result = useGitChangesStatus({ worktreePath: "/worktrees/one" });

		expect(result.status).toBe(status);
		expect(result.isLoading).toBe(false);
		expect(result.effectiveBaseBranch).toBe("release");
	});
});
