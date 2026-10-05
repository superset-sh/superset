import type { RouterOutputs } from "@superset/trpc";
import { useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

const CLOUD_PULL_REQUESTS_REFETCH_INTERVAL_MS = 30_000;
/** Matches the procedure's input bound. */
const MAX_REFS_PER_QUERY = 500;

export type CloudPullRequestRecord =
	RouterOutputs["integration"]["github"]["getByBranches"]["pullRequests"][number];

export type CloudPullRequest = Pick<
	CloudPullRequestRecord,
	"url" | "number" | "title" | "state" | "isDraft" | "additions" | "deletions"
>;

export interface CloudPullRequestRef {
	repoFullName: string;
	headBranch: string;
}

export function cloudPullRequestRefKey(ref: CloudPullRequestRef): string {
	return `${ref.repoFullName.toLowerCase()}\n${ref.headBranch}`;
}

export function useCloudPullRequests(refs: CloudPullRequestRef[]): {
	byRef: Map<string, CloudPullRequestRecord>;
} {
	const organizationId = useActiveOrganizationId();

	// Deduplicated and sorted so the query key only changes with the set of rows.
	const stableRefs = useMemo(() => {
		const byKey = new Map<string, CloudPullRequestRef>();
		for (const ref of refs) {
			byKey.set(cloudPullRequestRefKey(ref), {
				repoFullName: ref.repoFullName,
				headBranch: ref.headBranch,
			});
		}
		return [...byKey.entries()]
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([, ref]) => ref)
			.slice(0, MAX_REFS_PER_QUERY);
	}, [refs]);

	const query = cloudTrpc.integration.github.getByBranches.useQuery(
		{ organizationId: organizationId ?? "", refs: stableRefs },
		{
			enabled: organizationId !== null && stableRefs.length > 0,
			refetchInterval: CLOUD_PULL_REQUESTS_REFETCH_INTERVAL_MS,
			staleTime: 10_000,
			// Keep chips up while the row set changes, but never carry another
			// organization's answer across a switch.
			placeholderData: (previous, previousQuery) => {
				const previousInput = (
					previousQuery?.queryKey as
						| [unknown, { input?: { organizationId?: string } }?]
						| undefined
				)?.[1]?.input;
				return previousInput?.organizationId === organizationId
					? previous
					: undefined;
			},
		},
	);

	const byRef = useMemo(() => {
		const map = new Map<string, CloudPullRequestRecord>();
		for (const row of query.data?.pullRequests ?? []) {
			map.set(cloudPullRequestRefKey(row), row);
		}
		return map;
	}, [query.data]);

	return { byRef };
}
