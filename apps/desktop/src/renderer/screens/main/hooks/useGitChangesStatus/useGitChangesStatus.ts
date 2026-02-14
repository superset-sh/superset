import { electronTrpc } from "renderer/lib/electron-trpc";
import { useChangesStore } from "renderer/stores/changes";

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
	const { getBaseBranch } = useChangesStore();
	const baseBranch = getBaseBranch(worktreePath || "");

	const { data: branchData } = electronTrpc.changes.getBranches.useQuery(
		{ worktreePath: worktreePath || "" },
		{ enabled: enabled && !!worktreePath },
	);

	const effectiveBaseBranch = baseBranch ?? branchData?.defaultBranch ?? "main";

	const { data: status, isLoading } = electronTrpc.changes.getStatus.useQuery(
		{
			worktreePath: worktreePath || "",
			defaultBranch: effectiveBaseBranch,
		},
		{
			enabled: enabled && !!worktreePath,
			refetchInterval,
			refetchOnWindowFocus,
			staleTime,
		},
	);

	return { status, isLoading, effectiveBaseBranch };
}
