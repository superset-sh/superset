import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import type { ProjectOption } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

export function useRecentProjects(): ProjectOption[] {
	const collections = useCollections();

	const { data: v2Projects } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.select(({ projects }) => ({ ...projects })),
		[collections],
	);

	const { data: githubRepositories } = useLiveQuery(
		(q) =>
			q.from({ repos: collections.githubRepositories }).select(({ repos }) => ({
				id: repos.id,
				owner: repos.owner,
				name: repos.name,
			})),
		[collections],
	);

	return useMemo(() => {
		const repoById = new Map(
			(githubRepositories ?? []).map((repo) => [repo.id, repo]),
		);
		return (v2Projects ?? []).map((project) => {
			const repo = project.githubRepositoryId
				? (repoById.get(project.githubRepositoryId) ?? null)
				: null;
			return {
				id: project.id,
				name: project.name,
				githubOwner: repo?.owner ?? null,
				githubRepoName: repo?.name ?? null,
				iconUrl: project.iconUrl,
				needsSetup: null,
			};
		});
	}, [githubRepositories, v2Projects]);
}
