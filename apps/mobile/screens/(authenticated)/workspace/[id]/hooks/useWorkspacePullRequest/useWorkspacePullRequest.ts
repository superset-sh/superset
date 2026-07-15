import type { SelectGithubPullRequest } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { prStateFor } from "@/screens/(authenticated)/(home)/home/utils/prStateFor";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

const STATE_RANK = { open: 0, draft: 1, merged: 2, closed: 3 } as const;

/** The PR for the workspace's branch, best state first (open > draft > merged > closed). */
export function useWorkspacePullRequest(
	workspaceId: string | null,
): SelectGithubPullRequest | null {
	const collections = useCollections();
	const { workspace } = useWorkspaceHost(workspaceId);

	const { data: projects } = useLiveQuery(
		(q) => q.from({ v2Projects: collections.v2Projects }),
		[collections],
	);
	const { data: pullRequests } = useLiveQuery(
		(q) => q.from({ githubPullRequests: collections.githubPullRequests }),
		[collections],
	);

	return useMemo(() => {
		if (!workspace) return null;
		const repositoryId = (projects ?? []).find(
			(project) => project.id === workspace.projectId,
		)?.githubRepositoryId;
		if (!repositoryId) return null;
		const candidates = (pullRequests ?? []).filter(
			(pullRequest) =>
				pullRequest.repositoryId === repositoryId &&
				pullRequest.headBranch === workspace.branch,
		);
		candidates.sort(
			(a, b) => STATE_RANK[prStateFor(a)] - STATE_RANK[prStateFor(b)],
		);
		return candidates[0] ?? null;
	}, [workspace, projects, pullRequests]);
}
