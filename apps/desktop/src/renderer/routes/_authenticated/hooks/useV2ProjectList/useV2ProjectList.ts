import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export type V2ProjectSetupStatus = "ready" | "not_setup" | "path_missing";

export interface V2ProjectListItem {
	id: string;
	name: string;
	githubOwner: string | null;
	githubRepoName: string | null;
	setupStatus: V2ProjectSetupStatus;
}

export function useV2ProjectList(): V2ProjectListItem[] | undefined {
	const collections = useCollections();
	const { activeHostUrl } = useLocalHostService();

	const { data: v2Projects } = useLiveQuery(
		(q) =>
			q.from({ projects: collections.v2Projects }).select(({ projects }) => ({
				id: projects.id,
				name: projects.name,
				githubRepositoryId: projects.githubRepositoryId,
			})),
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

	const { data: setupStatusById } = useQuery({
		queryKey: ["project", "listSetupStatus", activeHostUrl],
		queryFn: async () => {
			if (!activeHostUrl) return {};
			const client = getHostServiceClientByUrl(activeHostUrl);
			return client.project.listSetupStatus.query();
		},
		enabled: !!activeHostUrl,
		refetchInterval: 5_000,
	});

	return useMemo(() => {
		if (!v2Projects) return undefined;
		const repoById = new Map((githubRepositories ?? []).map((r) => [r.id, r]));
		return v2Projects.map((project) => {
			const repo = project.githubRepositoryId
				? (repoById.get(project.githubRepositoryId) ?? null)
				: null;
			return {
				id: project.id,
				name: project.name,
				githubOwner: repo?.owner ?? null,
				githubRepoName: repo?.name ?? null,
				setupStatus: setupStatusById?.[project.id] ?? ("not_setup" as const),
			};
		});
	}, [v2Projects, githubRepositories, setupStatusById]);
}
