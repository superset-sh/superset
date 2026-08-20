import { useMemo } from "react";
import { useHostProjects } from "@/hooks/useHostProjects";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	type OrgPullRequest,
	usePullRequests,
} from "@/screens/(authenticated)/hooks/usePullRequests";

const NONE: OrgPullRequest[] = [];

/** Every pull request on the workspace's branch, newest first. */
export function useWorkspacePullRequests(
	workspaceId: string | null,
): OrgPullRequest[] {
	const { workspace, host } = useWorkspaceHost(workspaceId);
	const { projects } = useHostProjects(
		host
			? {
					organizationId: host.organizationId,
					machineId: host.machineId,
					isOnline: host.isOnline,
				}
			: null,
	);

	const pullRequests = usePullRequests();

	return useMemo(() => {
		if (!workspace) return NONE;
		// Projects are fully local: match PRs by repo coordinates parsed from
		// the PR URL (the cloud repo UUID isn't known host-side).
		const project = projects.find((item) => item.id === workspace.projectId);
		if (!project?.repoOwner || !project.repoName) return NONE;
		const repoPrefix =
			`https://github.com/${project.repoOwner}/${project.repoName}/`.toLowerCase();
		const candidates = pullRequests.filter(
			(pullRequest) =>
				pullRequest.url.toLowerCase().startsWith(repoPrefix) &&
				pullRequest.headBranch === workspace.branch,
		);
		// Newest first. With several pull requests on one branch, the recent one
		// is what is being worked on; ordering by state would bury it behind
		// whatever merely counts as "most open".
		candidates.sort(
			(a, b) =>
				new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
		);
		return candidates;
	}, [workspace, projects, pullRequests]);
}

/** The one worth showing when there is only room for one. */
export function useWorkspacePullRequest(
	workspaceId: string | null,
): OrgPullRequest | null {
	return useWorkspacePullRequests(workspaceId)[0] ?? null;
}
