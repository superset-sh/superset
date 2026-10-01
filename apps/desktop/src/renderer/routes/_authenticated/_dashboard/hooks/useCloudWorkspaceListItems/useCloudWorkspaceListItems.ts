import { useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { isViewerAlone } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacePresenceStack";
import type { CloudWorkspaceListItem } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacesList/components/CloudWorkspaceListRow";
import {
	type CloudPullRequestRef,
	cloudPullRequestRefKey,
	useCloudPullRequests,
} from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import { useCloudWorkspaceRepositories } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudWorkspaceRepositories";
import { useOpenPullRequestInApp } from "renderer/routes/_authenticated/_dashboard/hooks/useOpenPullRequestInApp";
import {
	EMPTY_CLOUD_SIDEBAR,
	useCloudSidebarStore,
} from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import {
	isCloudWorkspaceRead,
	isInCloudSidebar,
} from "renderer/routes/_authenticated/_dashboard/utils/buildCloudSidebar";

/** What a cloud workspace list row shows about each workspace, and what its controls do. */
export function useCloudWorkspaceListItems(workspaces: CloudWorkspaceRow[]) {
	const organizationId = useActiveOrganizationId();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? null;
	const sidebarState = useCloudSidebarStore((state) =>
		organizationId
			? (state.byOrganization[organizationId] ?? EMPTY_CLOUD_SIDEBAR)
			: EMPTY_CLOUD_SIDEBAR,
	);
	const setInSidebar = useCloudSidebarStore((state) => state.setInSidebar);
	const openPullRequest = useOpenPullRequestInApp();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const { repositoriesById } = useCloudWorkspaceRepositories({
		organizationId,
	});
	const pullRequestRefs = useMemo<CloudPullRequestRef[]>(
		() =>
			workspaces.flatMap((workspace) =>
				(repositoriesById.get(workspace.id) ?? []).map((repoFullName) => ({
					repoFullName,
					headBranch: workspace.branch,
				})),
			),
		[workspaces, repositoriesById],
	);
	const pullRequests = useCloudPullRequests(pullRequestRefs);

	const toItem = (workspace: CloudWorkspaceRow): CloudWorkspaceListItem => {
		const repos = repositoriesById.get(workspace.id) ?? [];
		const entry = sidebarState.entries[workspace.id];
		return {
			workspace,
			repos,
			pullRequests: repos.flatMap((repoFullName) => {
				const pullRequest = pullRequests.byRef.get(
					cloudPullRequestRefKey({
						repoFullName,
						headBranch: workspace.branch,
					}),
				);
				return pullRequest ? [pullRequest] : [];
			}),
			isInSidebar: isInCloudSidebar(workspace, entry, userId),
			isMine: userId !== null && workspace.createdBy?.userId === userId,
			showsPresence: !isViewerAlone(workspace.presence, userId ?? undefined),
			isRead: isCloudWorkspaceRead(workspace, entry?.lastReadAt),
		};
	};

	return {
		userId,
		toItem,
		onOpenPullRequest: openPullRequest,
		onOpenRepo: (fullName: string) =>
			openUrl.mutate(`https://github.com/${fullName}`),
		onSetInSidebar: (workspaceId: string, inSidebar: boolean) => {
			if (organizationId) setInSidebar(organizationId, workspaceId, inSidebar);
		},
	};
}
