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
			refetchInterval: branchRefetchInterval,
			refetchOnWindowFocus: branchRefetchOnWindowFocus,
		},
	);

	const effectiveBaseBranch =
		branchData?.worktreeBaseBranch ?? branchData?.defaultBranch ?? "main";

	const {
		data: status,
		isLoading,
		refetch,
	} = electronTrpc.changes.getStatus.useQuery(
		{
			worktreePath: worktreePath || "",
			defaultBranch: effectiveBaseBranch,
		},
		{
			enabled: enabled && !!worktreePath && !!branchData,
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
			staleTime,
		},
	);

	return { status, isLoading, effectiveBaseBranch, branchData, refetch };
}
