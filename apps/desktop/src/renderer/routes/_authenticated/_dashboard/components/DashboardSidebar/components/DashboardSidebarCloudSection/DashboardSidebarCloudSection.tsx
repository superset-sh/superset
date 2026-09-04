import { useLingui } from "@lingui/react/macro";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import {
	type CloudPullRequestRef,
	cloudPullRequestRefKey,
	useSidebarCloudPullRequests,
} from "../../hooks/useSidebarCloudPullRequests";
import type { DashboardSidebarWorkspace } from "../../types";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSectionHeader";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";

/**
 * Cloud workspaces, above the projects.
 *
 * They sit in their own section rather than under a project because the row a
 * sandbox serves carries the sandbox's own project id — there is no cloud
 * project to group under.
 *
 * The cloud row owns the workspace's identity — it is what created, named and
 * lists it. The row inside the sandbox exists only so host-service has
 * something to serve panes against, so its name is ignored here. Only the
 * open workspace's sandbox is in the fan-out, so every other row shows the
 * branch it was created on; pull requests come from the cloud table.
 */
export function DashboardSidebarCloudSection({
	isCollapsed,
	onWorkspaceHover,
}: {
	isCollapsed?: boolean;
	onWorkspaceHover?: (workspaceId: string) => void | Promise<void>;
}) {
	const { t } = useLingui();
	const { workspaces: cloudWorkspaces } = useCloudWorkspaces();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const isSectionCollapsed = useSidebarSectionsCollapseStore(
		(s) => s.collapsed.cloud,
	);

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

	// Every cloud workspace clones the one cloud repository.
	const organizationId = useActiveOrganizationId();
	const { data: cloudRepo } = cloudTrpc.cloudWorkspace.repo.useQuery(
		{ organizationId: organizationId ?? "" },
		{
			enabled: organizationId !== null && cloudWorkspaces.length > 0,
			// Finite so an App installed mid-session is picked up.
			staleTime: 5 * 60_000,
		},
	);
	const cloudRepoFullName = cloudRepo
		? `${cloudRepo.owner}/${cloudRepo.name}`
		: null;

	// Only the open workspace's sandbox is in the fan-out, so this holds at
	// most one row.
	const servedById = useMemo(
		() => new Map(hostWorkspaces.map((row) => [row.id, row])),
		[hostWorkspaces],
	);

	const pullRequestRefs = useMemo<CloudPullRequestRef[]>(
		() =>
			cloudRepoFullName
				? cloudWorkspaces.map((cloud) => ({
						repoFullName: cloudRepoFullName,
						headBranch: servedById.get(cloud.id)?.branch ?? cloud.branch,
					}))
				: [],
		[servedById, cloudRepoFullName, cloudWorkspaces],
	);
	const cloudPullRequests = useSidebarCloudPullRequests(pullRequestRefs);

	const rows = useMemo<DashboardSidebarWorkspace[]>(() => {
		const localById = new Map(
			localStateRows.map((row) => [row.workspaceId, row]),
		);
		return cloudWorkspaces
			.filter((cloud) => {
				const local = localById.get(cloud.id);
				// Hidden rows stay gone until the workspace is opened again, and a
				// pinned one renders in the Pinned section instead — rendering it
				// here too would show the same workspace twice.
				return !local?.isHidden && local?.pinnedAt == null;
			})
			.sort(
				(left, right) =>
					(localById.get(left.id)?.tabOrder ?? 0) -
					(localById.get(right.id)?.tabOrder ?? 0),
			)
			.map((cloud) => {
				const served = servedById.get(cloud.id);
				const branch = served?.branch ?? cloud.branch;
				const pullRequest = cloudRepoFullName
					? (cloudPullRequests.byRef.get(
							cloudPullRequestRefKey({
								repoFullName: cloudRepoFullName,
								headBranch: branch,
							}),
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
					isPinned: false,
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
		cloudRepoFullName,
		cloudWorkspaces,
		localStateRows,
	]);

	if (rows.length === 0) return null;

	if (isCollapsed) {
		return (
			<div className="flex flex-col gap-0.5 py-1">
				{rows.map((workspace) => (
					<DashboardSidebarWorkspaceItem
						key={workspace.id}
						workspace={workspace}
						isCollapsed
						onHoverCardOpen={onWorkspaceHover}
					/>
				))}
				<div className="mx-3 mt-1 border-b border-border" />
			</div>
		);
	}

	return (
		<div className="mt-3 pb-1 first:mt-0">
			<DashboardSidebarSectionHeader
				label={t({ message: "Cloud" })}
				section="cloud"
			/>
			{!isSectionCollapsed &&
				rows.map((workspace) => (
					<DashboardSidebarWorkspaceItem
						key={workspace.id}
						workspace={workspace}
						indentation="top-level"
						onHoverCardOpen={onWorkspaceHover}
					/>
				))}
		</div>
	);
}
