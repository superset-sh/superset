import { electronTrpc } from "renderer/lib/electron-trpc";

interface UseGitChangesStatusOptions {
	worktreePath: string | undefined;
	enabled?: boolean;
	refetchInterval?: number;
	refetchOnWindowFocus?: boolean;
	staleTime?: number;
}

export function useGitChangesStatus({
	worktreePath,
	enabled = true,
	refetchInterval,
	refetchOnWindowFocus,
	staleTime,
}: UseGitChangesStatusOptions) {
	const { data: branchData } = electronTrpc.changes.getBranches.useQuery(
		{ worktreePath: worktreePath || "" },
		{ enabled: enabled && !!worktreePath },
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
			refetchInterval,
			refetchOnWindowFocus,
			staleTime,
		},
	);

	return { status, isLoading, effectiveBaseBranch, refetch };
}
