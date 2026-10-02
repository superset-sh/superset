import type { RouterOutputs } from "@superset/trpc";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

const REFETCH_INTERVAL_MS = 30_000;
const MAX_REFS_PER_QUERY = 500;

export type CloudPullRequest =
	RouterOutputs["integration"]["github"]["getByBranches"]["pullRequests"][number];

export interface CloudPullRequestRef {
	repoFullName: string;
	headBranch: string;
}

export function cloudPullRequestRefKey(ref: CloudPullRequestRef): string {
	return `${ref.repoFullName.toLowerCase()}\n${ref.headBranch}`;
}

/**
 * Desktop's useCloudPullRequests: each cloud workspace's pull request, read
 * from the GitHub integration by repository and branch rather than from the
 * sandbox, so a list of them wakes nothing.
 */
export function useCloudPullRequests(
	refs: CloudPullRequestRef[],
): Map<string, CloudPullRequest> {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	const stableRefs = useMemo(() => {
		const byKey = new Map<string, CloudPullRequestRef>();
		for (const ref of refs) byKey.set(cloudPullRequestRefKey(ref), ref);
		return [...byKey.entries()]
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([, ref]) => ref)
			.slice(0, MAX_REFS_PER_QUERY);
	}, [refs]);

	const { data } = useQuery({
		queryKey: [
			"cloud",
			"integration",
			"github",
			"getByBranches",
			organizationId,
			stableRefs,
		],
		enabled: organizationId !== null && stableRefs.length > 0,
		refetchInterval: REFETCH_INTERVAL_MS,
		staleTime: 10_000,
		placeholderData: (previous, previousQuery) =>
			previousQuery?.queryKey[4] === organizationId ? previous : undefined,
		queryFn: () =>
			apiClient.integration.github.getByBranches.query({
				organizationId: organizationId as string,
				refs: stableRefs,
			}),
	});

	return useMemo(() => {
		const byRef = new Map<string, CloudPullRequest>();
		for (const pullRequest of data?.pullRequests ?? []) {
			byRef.set(cloudPullRequestRefKey(pullRequest), pullRequest);
		}
		return byRef;
	}, [data]);
}
