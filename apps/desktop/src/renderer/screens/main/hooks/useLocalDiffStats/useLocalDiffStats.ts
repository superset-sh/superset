import { useMemo } from "react";
import { useGitChangesStatus } from "renderer/screens/main/hooks/useGitChangesStatus";

export interface LocalDiffStats {
	additions: number;
	deletions: number;
}

interface UseLocalDiffStatsOptions {
	worktreePath: string | undefined;
	enabled?: boolean;
	staleTime?: number;
}

export function useLocalDiffStats({
	worktreePath,
	enabled = true,
	staleTime,
}: UseLocalDiffStatsOptions): LocalDiffStats | null {
	const { status } = useGitChangesStatus({
		worktreePath,
		enabled: enabled && !!worktreePath,
		staleTime,
	});

	return useMemo(() => {
		if (!status) return null;
		const allFiles =
			status.againstBase.length > 0
				? status.againstBase
				: [...status.staged, ...status.unstaged, ...status.untracked];
		const additions = allFiles.reduce((sum, f) => sum + (f.additions || 0), 0);
		const deletions = allFiles.reduce((sum, f) => sum + (f.deletions || 0), 0);
		if (additions === 0 && deletions === 0) return null;
		return { additions, deletions };
	}, [status]);
}
