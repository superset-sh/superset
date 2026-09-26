import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useLiveQuery } from "@tanstack/react-db";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import type { DashboardSidebarWorkspace } from "../../types";
import {
	type CloudPullRequestRef,
	cloudPullRequestRefKey,
	useSidebarCloudPullRequests,
} from "../useSidebarCloudPullRequests";

export function useDashboardSidebarCloudWorkspaces() {
	const { workspaces: cloudWorkspaces = [] } = useCloudWorkspaces();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	// The same flag that offers Cloud in the device picker, and the same
	// audience the API allows (`assertInternal`). Undefined means the flags
	// haven't resolved, which is neither a yes nor a no.
	const cloudFlag = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const isCloudEnabled = cloudFlag === true;

	// Row visibility, pinning and order all live in the same local-state
	// collection every other sidebar row reads. Rendering straight off the
	// cloud list instead is what made "Remove from sidebar" look inert: the
	// action wrote `isHidden` and nothing here consulted it.
	const collections = useCollections();
	const { data: localStateRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ local: collections.v2WorkspaceLocalState })
				.select(({ local }) => ({
					workspaceId: local.workspaceId,
					isHidden: local.sidebarState.isHidden,
					pinnedAt: local.sidebarState.pinnedAt,
					tabOrder: local.sidebarState.tabOrder,
					suppressedPullRequestUrl: local.sidebarState.suppressedPullRequestUrl,
				})),
		[collections],
	);

	// Each cloud workspace's pull requests live in its primary repository.
	const organizationId = useActiveOrganizationId();
	const { data: cloudRepositories } =
		cloudTrpc.cloudWorkspace.repositories.useQuery(
			{ organizationId: organizationId ?? "" },
			{
				enabled: organizationId !== null && cloudWorkspaces.length > 0,
				staleTime: 5 * 60_000,
			},
		);
	const repoFullNameById = useMemo(
		() =>
			new Map(
				(cloudRepositories ?? [])
					.filter((row) => row.primary)
					.map((row) => [row.cloudWorkspaceId, row.fullName] as const),
			),
		[cloudRepositories],
	);

	// Only the open workspace's sandbox is in the fan-out, so this holds at
	// most one row.
	const servedById = useMemo(
		() => new Map(hostWorkspaces.map((row) => [row.id, row])),
		[hostWorkspaces],
	);

	const pullRequestRefs = useMemo<CloudPullRequestRef[]>(
		() =>
			cloudWorkspaces.flatMap((cloud) => {
				const repoFullName = repoFullNameById.get(cloud.id);
				return repoFullName
					? [
							{
								repoFullName,
								headBranch: servedById.get(cloud.id)?.branch ?? cloud.branch,
							},
						]
					: [];
			}),
		[servedById, repoFullNameById, cloudWorkspaces],
	);
	const cloudPullRequests = useSidebarCloudPullRequests(pullRequestRefs);

	const rows = useMemo<DashboardSidebarWorkspace[]>(() => {
		const localById = new Map(
			localStateRows.map((row) => [row.workspaceId, row]),
		);
		return cloudWorkspaces
			.filter((cloud) => {
				const local = localById.get(cloud.id);
				return !local?.isHidden;
			})
			.sort(
				(left, right) =>
					(localById.get(left.id)?.tabOrder ?? 0) -
					(localById.get(right.id)?.tabOrder ?? 0),
			)
			.map((cloud) => {
				const served = servedById.get(cloud.id);
				const branch = served?.branch ?? cloud.branch;
				const repoFullName = repoFullNameById.get(cloud.id);
				const pullRequest = repoFullName
					? (cloudPullRequests.byRef.get(
							cloudPullRequestRefKey({ repoFullName, headBranch: branch }),
						) ?? null)
					: null;
				const suppressedUrl = localById.get(cloud.id)?.suppressedPullRequestUrl;
				return {
					id: cloud.id,
					// Grouping is by section here, and the sandbox's project id means
					// nothing to this client.
					projectId: null,
					hostId: cloud.id,
					hostType: "cloud",
					type: "worktree",
					// A sandbox is reachable or it isn't; there is no offline device
					// behind it to report on.
					hostIsOnline: null,
					accentColor: null,
					// The sandbox host stamps this like any other host; null until
					// its list has answered.
					lastActivityAt: served?.lastActivityAt ?? null,
					name: cloud.name,
					branch,
					pullRequest:
						pullRequest && pullRequest.url !== suppressedUrl
							? pullRequest
							: null,
					repoUrl: null,
					branchExistsOnRemote: true,
					previewUrl: null,
					needsRebase: null,
					behindCount: null,
					createdAt: cloud.createdAt,
					updatedAt: cloud.updatedAt,
					taskId: null,
					isPinned: localById.get(cloud.id)?.pinnedAt != null,
					// Same row treatment a local create gets while it is in flight —
					// a spinner instead of a status dot, and no rename/delete menu
					// on a workspace whose sandbox doesn't exist yet.
					pendingTransaction:
						cloud.status === "provisioning"
							? {
									id: cloud.id,
									workspaceId: cloud.id,
									type: "insert",
									state: "pending",
									createdAt: cloud.createdAt,
									updatedAt: cloud.updatedAt,
								}
							: null,
				};
			});
	}, [
		servedById,
		cloudPullRequests.byRef,
		repoFullNameById,
		cloudWorkspaces,
		localStateRows,
	]);

	return {
		rows: cloudFlag === false ? [] : rows.filter((row) => !row.isPinned),
		pinnedRows: cloudFlag === false ? [] : rows.filter((row) => row.isPinned),
		cloudFlag,
		isCloudEnabled,
	};
}
