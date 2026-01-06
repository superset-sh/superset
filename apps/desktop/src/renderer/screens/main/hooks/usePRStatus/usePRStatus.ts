import type { GitHubStatus } from "@superset/local-db";
import { trpc } from "renderer/lib/trpc";

interface UsePRStatusOptions {
	workspaceId: string | undefined;
	enabled?: boolean;
	refetchInterval?: number;
}

interface UsePRStatusResult {
	pr: GitHubStatus["pr"] | null;
	repoUrl: string | null;
	branchExistsOnRemote: boolean;
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
	} = trpc.workspaces.getGitHubStatus.useQuery(
		{ workspaceId: workspaceId ?? "" },
		{
			enabled: enabled && !!workspaceId,
			refetchInterval,
		},
	);

	return {
		pr: githubStatus?.pr ?? null,
		repoUrl: githubStatus?.repoUrl ?? null,
		branchExistsOnRemote: githubStatus?.branchExistsOnRemote ?? false,
		isLoading,
		refetch,
	};
}
