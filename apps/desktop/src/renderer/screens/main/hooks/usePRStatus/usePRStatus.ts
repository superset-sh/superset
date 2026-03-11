import type { GitHubStatus } from "@superset/local-db";
import { electronTrpc } from "renderer/lib/electron-trpc";

const GITHUB_STATUS_STALE_TIME_MS = 5 * 60 * 1000;

interface UsePRStatusOptions {
	workspaceId: string | undefined;
	enabled?: boolean;
	refetchInterval?: number;
}

interface UsePRStatusResult {
	pr: GitHubStatus["pr"] | null;
	repoUrl: string | null;
	branchExistsOnRemote: boolean;
	previewUrl: string | undefined;
	isLoading: boolean;
	refetch: () => void;
}

/**
 * Hook to fetch and manage GitHub PR status for a workspace.
 * Returns PR info, loading state, and refetch function.
 */
export function usePRStatus({
	workspaceId,
	enabled = true,
	refetchInterval,
}: UsePRStatusOptions): UsePRStatusResult {
	const {
		data: githubStatus,
		isLoading,
		refetch,
	} = electronTrpc.workspaces.getGitHubStatus.useQuery(
		{ workspaceId: workspaceId ?? "" },
		{
			enabled: enabled && !!workspaceId,
			refetchInterval,
			staleTime: GITHUB_STATUS_STALE_TIME_MS,
			refetchOnWindowFocus: false,
		},
	);

	return {
		pr: githubStatus?.pr ?? null,
		repoUrl: githubStatus?.repoUrl ?? null,
		branchExistsOnRemote: githubStatus?.branchExistsOnRemote ?? false,
		previewUrl: githubStatus?.previewUrl,
		isLoading,
		refetch,
	};
}
