import { electronTrpc } from "renderer/lib/electron-trpc";

interface UseGitChangesStatusOptions {
	worktreePath: string | undefined;
	workspaceId?: string;
	enabled?: boolean;
	refetchInterval?: number;
	refetchOnWindowFocus?: boolean;
	staleTime?: number;
}

export function useGitChangesStatus({
	worktreePath,
	workspaceId,
	enabled = true,
	refetchInterval,
	refetchOnWindowFocus,
	staleTime,
}: UseGitChangesStatusOptions) {
	const { data: branchData } = electronTrpc.changes.getBranches.useQuery(
		{ worktreePath: worktreePath || "", workspaceId },
		{
			enabled: enabled && !!worktreePath,
			retry: 3,
			retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
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
			workspaceId,
		},
		{
			enabled: enabled && !!worktreePath && !!branchData,
			refetchInterval,
			refetchOnWindowFocus,
			staleTime,
		},
	);

	return { status, isLoading, effectiveBaseBranch, refetch };
}
