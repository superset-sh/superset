import { useCallback, useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { DashboardSidebarWorkspacePullRequest } from "../../types";
import { toSidebarPullRequest } from "./toSidebarPullRequest";

const CLOUD_PULL_REQUESTS_REFETCH_INTERVAL_MS = 30_000;
/** Matches the procedure's input bound. */
const MAX_REFS_PER_QUERY = 500;

export interface CloudPullRequestRef {
	repoFullName: string;
	headBranch: string;
}

export function cloudPullRequestRefKey(ref: CloudPullRequestRef): string {
	return `${ref.repoFullName.toLowerCase()}\n${ref.headBranch}`;
}

export interface SidebarCloudPullRequests {
	/** Chip per ref key (see cloudPullRequestRefKey); absent = no PR known. */
	byRef: Map<string, DashboardSidebarWorkspacePullRequest>;
	/**
	 * Null until the first answer. False means the organization has no
	 * GitHub App installation, so the cloud table can never know its PRs.
	 */
	hasInstallation: boolean | null;
	isError: boolean;
	refetch: () => Promise<unknown>;
}

/** Sidebar chips from the cloud `github_pull_requests` table: one request for every row on screen. */
export function useSidebarCloudPullRequests(
	refs: CloudPullRequestRef[],
): SidebarCloudPullRequests {
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
			enabled: organizationId !== null,
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
		const map = new Map<string, DashboardSidebarWorkspacePullRequest>();
		for (const row of query.data?.pullRequests ?? []) {
			map.set(cloudPullRequestRefKey(row), toSidebarPullRequest(row));
		}
		return map;
	}, [query.data]);

	const refetch = query.refetch;
	const refetchStable = useCallback(() => refetch(), [refetch]);

	return {
		byRef,
		hasInstallation: query.data?.hasInstallation ?? null,
		isError: query.isError,
		refetch: refetchStable,
	};
}
