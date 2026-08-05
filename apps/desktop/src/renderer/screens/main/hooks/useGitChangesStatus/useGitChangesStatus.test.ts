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

const {
	ERROR_BACKOFF_REFETCH_INTERVAL_MS,
	GIT_CHANGES_QUERY_GC_TIME_MS,
	useGitChangesStatus,
} = await import("./useGitChangesStatus");

type RefetchIntervalFn = (query: {
	state: {
		status: "success" | "error";
		data?: GitChangesStatus;
		error?: { data?: { code?: string } } | null;
	};
}) => number | false;

function getStatusRefetchInterval(): RefetchIntervalFn {
	const options = getStatusUseQuery.mock.calls[0]?.[1] as {
		refetchInterval: RefetchIntervalFn;
	};
	return options.refetchInterval;
}

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

	test("polls at the configured interval on success", () => {
		useGitChangesStatus({
			worktreePath: "/worktrees/one",
			refetchInterval: 2500,
		});

		const interval = getStatusRefetchInterval();
		expect(interval({ state: { status: "success", data: status } })).toBe(2500);
	});

	test("backs off to the slow interval on deterministic failures", () => {
		useGitChangesStatus({
			worktreePath: "/worktrees/one",
			refetchInterval: 2500,
		});

		const interval = getStatusRefetchInterval();
		for (const code of [
			"BAD_REQUEST",
			"NOT_FOUND",
			"PRECONDITION_FAILED",
			"FORBIDDEN",
		]) {
			expect(
				interval({ state: { status: "error", error: { data: { code } } } }),
			).toBe(ERROR_BACKOFF_REFETCH_INTERVAL_MS);
		}
	});

	test("slows but keeps retrying on transient failures", () => {
		useGitChangesStatus({
			worktreePath: "/worktrees/one",
			refetchInterval: 2500,
		});

		const interval = getStatusRefetchInterval();
		expect(
			interval({
				state: {
					status: "error",
					error: { data: { code: "INTERNAL_SERVER_ERROR" } },
				},
			}),
		).toBe(10_000);
		expect(interval({ state: { status: "error", error: null } })).toBe(10_000);
	});

	test("never starts polling on error when no interval is configured", () => {
		useGitChangesStatus({ worktreePath: "/worktrees/one" });

		const interval = getStatusRefetchInterval();
		expect(
			interval({
				state: {
					status: "error",
					error: { data: { code: "NOT_FOUND" } },
				},
			}),
		).toBe(false);
	});
});
