import { electronTrpc } from "renderer/lib/electron-trpc";
import type { GitChangesStatus } from "shared/changes-types";

interface UseGitChangesStatusOptions {
	worktreePath: string | undefined;
	enabled?: boolean;
	refetchInterval?: number;
	refetchOnWindowFocus?: boolean;
	staleTime?: number;
	/** Only fetch quick status (no enrichment). Use for sidebar/hover contexts. */
	quickOnly?: boolean;
}

interface UseGitChangesStatusResult {
	status: GitChangesStatus | undefined;
	isLoading: boolean;
	/** Whether detailed enrichment (line counts, against-base) is still loading */
	isEnriching: boolean;
	effectiveBaseBranch: string;
	refetch: () => void;
}

export function useGitChangesStatus({
	worktreePath,
	enabled = true,
	refetchInterval,
	refetchOnWindowFocus,
	staleTime,
	quickOnly = false,
}: UseGitChangesStatusOptions): UseGitChangesStatusResult {
	const { data: branchData } = electronTrpc.changes.getBranches.useQuery(
		{ worktreePath: worktreePath || "" },
		{ enabled: enabled && !!worktreePath },
	);

	const effectiveBaseBranch =
		branchData?.worktreeBaseBranch ?? branchData?.defaultBranch ?? "main";

	// Phase 1: Quick status (fast — just file lists + ahead/behind)
	const {
		data: quickStatus,
		isLoading: isQuickLoading,
		refetch: refetchQuick,
	} = electronTrpc.changes.getStatusQuick.useQuery(
		{
			worktreePath: worktreePath || "",
			defaultBranch: effectiveBaseBranch,
		},
		{
			enabled: enabled && !!worktreePath && !!branchData,
			refetchInterval,
			refetchOnWindowFocus,
			staleTime,
		},
	);

	// Phase 2: Detailed status (slow — numstat, untracked line counts, against-base diff)
	const {
		data: detailedStatus,
		isLoading: isDetailedLoading,
		refetch: refetchDetailed,
	} = electronTrpc.changes.getStatus.useQuery(
		{
			worktreePath: worktreePath || "",
			defaultBranch: effectiveBaseBranch,
		},
		{
			enabled:
				!quickOnly && enabled && !!worktreePath && !!branchData && !!quickStatus,
			staleTime: staleTime ?? 10_000,
			refetchOnWindowFocus,
		},
	);

	const refetch = () => {
		refetchQuick();
		if (!quickOnly) {
			refetchDetailed();
		}
	};

	// Return detailed when available, fall back to quick
	const status = quickOnly
		? quickStatus
		: (detailedStatus ?? quickStatus);

	const isLoading = isQuickLoading;
	const isEnriching = !quickOnly && !detailedStatus && isDetailedLoading;

	return { status, isLoading, isEnriching, effectiveBaseBranch, refetch };
}
