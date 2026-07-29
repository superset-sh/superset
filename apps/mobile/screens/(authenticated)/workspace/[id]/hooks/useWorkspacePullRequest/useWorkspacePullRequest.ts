import type { SelectGithubPullRequest } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useHostProjects } from "@/hooks/useHostProjects";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { prStateFor } from "@/screens/(authenticated)/(home)/home/utils/prStateFor";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

const STATE_RANK = { open: 0, draft: 1, merged: 2, closed: 3 } as const;

/** The PR for the workspace's branch, best state first (open > draft > merged > closed). */
export function useWorkspacePullRequest(
	workspaceId: string | null,
): SelectGithubPullRequest | null {
	const collections = useCollections();
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

	const { data: pullRequests } = useLiveQuery(
		(q) => q.from({ githubPullRequests: collections.githubPullRequests }),
		[collections],
	);

	return useMemo(() => {
		if (!workspace) return null;
		// Projects are fully local: match PRs by repo coordinates parsed from
		// the PR URL (the cloud repo UUID isn't known host-side).
		const project = projects.find((item) => item.id === workspace.projectId);
		if (!project?.repoOwner || !project.repoName) return null;
		const repoPrefix =
			`https://github.com/${project.repoOwner}/${project.repoName}/`.toLowerCase();
		const candidates = (pullRequests ?? []).filter(
			(pullRequest) =>
				pullRequest.url.toLowerCase().startsWith(repoPrefix) &&
				pullRequest.headBranch === workspace.branch,
		);
		candidates.sort(
			(a, b) => STATE_RANK[prStateFor(a)] - STATE_RANK[prStateFor(b)],
		);
		return candidates[0] ?? null;
	}, [workspace, projects, pullRequests]);
}
