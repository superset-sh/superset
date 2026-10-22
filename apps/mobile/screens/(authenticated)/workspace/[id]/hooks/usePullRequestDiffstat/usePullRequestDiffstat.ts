import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";
import type { WorkspacePullRequest } from "../useWorkspacePullRequest";

export interface PullRequestDiffstat {
	additions: number;
	deletions: number;
}

/**
 * The host's PR history carries no per-PR detail, so the diffstat is fetched
 * per pull request, as the viewer. Null until the numbers exist.
 */
export function usePullRequestDiffstat({
	pullRequest,
	enabled = true,
}: {
	pullRequest: WorkspacePullRequest | undefined;
	enabled?: boolean;
}): PullRequestDiffstat | null {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const { data } = useQuery({
		queryKey: ["pull-request-diffstat", organizationId, pullRequest?.key],
		enabled: enabled && organizationId !== null && pullRequest !== undefined,
		staleTime: 5 * 60_000,
		retry: false,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!organizationId || !pullRequest) return null;
			const { pullRequest: pr } =
				await apiClient.integration.github.getPullRequestDetail.query({
					organizationId,
					repoFullName: `${pullRequest.repoOwner}/${pullRequest.repoName}`,
					number: pullRequest.prNumber,
				});
			return { additions: pr.additions, deletions: pr.deletions };
		},
	});
	return data ?? null;
}
