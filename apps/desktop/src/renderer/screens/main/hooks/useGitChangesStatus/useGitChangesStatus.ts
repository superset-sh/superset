import { electronTrpc } from "renderer/lib/electron-trpc";
import type { GitChangesStatus } from "shared/changes-types";

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
			refetchInterval: branchRefetchInterval,
			refetchOnWindowFocus: branchRefetchOnWindowFocus,
			staleTime: BRANCH_QUERY_STALE_TIME_MS,
		},
	);

	const {
		data: status,
		isLoading: isStatusLoading,
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
		effectiveBaseBranch,
		branchData,
		refetch,
	};
}
