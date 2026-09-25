import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type GitChangesErrorCause,
	type GitChangesStatus,
	isGitChangesErrorCause,
} from "shared/changes-types";

interface UseGitChangesStatusOptions {
	worktreePath: string | undefined;
	enabled?: boolean;
	refetchInterval?: number;
	refetchOnWindowFocus?: boolean;
	staleTime?: number;
	branchRefetchInterval?: number;
	branchRefetchOnWindowFocus?: boolean;
}

const LARGE_CHANGESET_THRESHOLD = 200;
const LARGE_CHANGESET_REFETCH_INTERVAL_MS = 10_000;
const STATUS_QUERY_STALE_TIME_MS = 2_000;
const BRANCH_QUERY_STALE_TIME_MS = 10_000;
export const GIT_CHANGES_QUERY_GC_TIME_MS = 30 * 60_000;

// Deterministic failures (missing worktree, not a repo, pathological repo)
// won't heal on their own — slow-poll instead of hammering every tick.
// refetchOnWindowFocus still gives instant recovery when the user returns.
const DETERMINISTIC_FAILURE_CODES = new Set([
	"BAD_REQUEST",
	"NOT_FOUND",
	"PRECONDITION_FAILED",
	"FORBIDDEN",
]);
export const ERROR_BACKOFF_REFETCH_INTERVAL_MS = 30_000;

interface QueryErrorLike {
	data?: { code?: string; cause?: unknown } | null;
}

function errorBackoffInterval(baseInterval: number, error: unknown): number {
	const code = (error as QueryErrorLike | null)?.data?.code;
	if (code && DETERMINISTIC_FAILURE_CODES.has(code)) {
		return ERROR_BACKOFF_REFETCH_INTERVAL_MS;
	}
	return Math.max(baseInterval, LARGE_CHANGESET_REFETCH_INTERVAL_MS);
}

export function getGitChangesErrorCause(
	error: unknown,
): GitChangesErrorCause | undefined {
	const cause = (error as QueryErrorLike | null)?.data?.cause;
	return isGitChangesErrorCause(cause) ? cause : undefined;
}

export function gitChangesUnavailableCopy(cause: GitChangesErrorCause): string {
	switch (cause.kind) {
		case "WORKTREE_MISSING":
			return "Workspace folder no longer exists on disk";
		case "PATH_VALIDATION":
			return cause.code === "UNREGISTERED_WORKTREE"
				? "Workspace folder no longer exists on disk"
				: "Unable to load changes";
		case "NOT_GIT_REPO":
			return "This workspace is not a git repository";
		case "GIT_ENVIRONMENT":
			return "Git can't read this workspace";
	}
}

export function useGitChangesStatus({
	worktreePath,
	enabled = true,
	refetchInterval,
	refetchOnWindowFocus,
	staleTime,
	branchRefetchInterval,
	branchRefetchOnWindowFocus,
}: UseGitChangesStatusOptions) {
	const { data: branchData } = electronTrpc.changes.getBranches.useQuery(
		{ worktreePath: worktreePath || "" },
		{
			enabled: enabled && !!worktreePath,
			gcTime: GIT_CHANGES_QUERY_GC_TIME_MS,
			refetchInterval: (query) => {
				if (!branchRefetchInterval) return false;
				if (query.state.status === "error") {
					return errorBackoffInterval(branchRefetchInterval, query.state.error);
				}
				return branchRefetchInterval;
			},
			refetchOnWindowFocus: branchRefetchOnWindowFocus,
			staleTime: BRANCH_QUERY_STALE_TIME_MS,
		},
	);

	const {
		data: status,
		isLoading: isStatusLoading,
		error,
		refetch,
	} = electronTrpc.changes.getStatus.useQuery(
		{
			worktreePath: worktreePath || "",
		},
		{
			enabled: enabled && !!worktreePath,
			gcTime: GIT_CHANGES_QUERY_GC_TIME_MS,
			refetchInterval: (query) => {
				if (!refetchInterval) return false;
				if (query.state.status === "error") {
					return errorBackoffInterval(refetchInterval, query.state.error);
				}
				const data = query.state.data as GitChangesStatus | undefined;
				if (!data) return refetchInterval;

				const totalChangedFiles =
					data.againstBase.length +
					data.staged.length +
					data.unstaged.length +
					data.untracked.length;

				if (totalChangedFiles >= LARGE_CHANGESET_THRESHOLD) {
					return Math.max(refetchInterval, LARGE_CHANGESET_REFETCH_INTERVAL_MS);
				}

				return refetchInterval;
			},
			refetchOnWindowFocus,
			staleTime: staleTime ?? STATUS_QUERY_STALE_TIME_MS,
		},
	);
	const effectiveBaseBranch =
		status?.defaultBranch ??
		branchData?.worktreeBaseBranch ??
		branchData?.defaultBranch ??
		"main";

	return {
		status,
		isLoading: !status && isStatusLoading,
		error,
		errorCause: getGitChangesErrorCause(error),
		effectiveBaseBranch,
		branchData,
		refetch,
	};
}
