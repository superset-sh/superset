import type { RouterOutputs } from "@superset/trpc";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export type OrgPullRequest =
	RouterOutputs["integration"]["github"]["listPullRequests"][number];

const PULL_REQUESTS_REFETCH_INTERVAL_MS = 60_000;
const NO_PULL_REQUESTS: OrgPullRequest[] = [];

/**
 * Every synced pull request in the active organization, any state — rows are
 * matched to workspaces by repo coordinates and branch, and merged/closed PRs
 * still get a badge.
 */
export function usePullRequests(): OrgPullRequest[] {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	const query = useQuery({
		queryKey: [
			"cloud",
			"integration",
			"github",
			"listPullRequests",
			organizationId,
		],
		enabled: organizationId !== null,
		refetchInterval: PULL_REQUESTS_REFETCH_INTERVAL_MS,
		staleTime: 30_000,
		queryFn: () => {
			if (!organizationId) return NO_PULL_REQUESTS;
			return apiClient.integration.github.listPullRequests.query({
				organizationId,
				state: "all",
			});
		},
	});

	return query.data ?? NO_PULL_REQUESTS;
}
