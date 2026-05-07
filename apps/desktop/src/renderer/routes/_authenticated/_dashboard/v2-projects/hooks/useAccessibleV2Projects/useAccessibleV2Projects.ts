import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { MOCK_ORG_ID } from "shared/constants";

export interface AccessibleV2Project {
	id: string;
	name: string;
	slug: string;
	repoCloneUrl: string | null;
	githubOwner: string | null;
	githubRepoName: string | null;
	githubFullName: string | null;
	createdAt: Date;
	updatedAt: Date;
	workspaceCount: number;
}

interface UseAccessibleV2ProjectsOptions {
	searchQuery?: string;
}

function projectMatchesSearch(
	project: AccessibleV2Project,
	searchQuery: string,
): boolean {
	if (!searchQuery.trim()) return true;
	const query = searchQuery.trim().toLowerCase();
	return (
		project.name.toLowerCase().includes(query) ||
		project.slug.toLowerCase().includes(query) ||
		(project.githubFullName ?? "").toLowerCase().includes(query)
	);
}

export function useAccessibleV2Projects(
	options: UseAccessibleV2ProjectsOptions = {},
): AccessibleV2Project[] {
	const searchQuery = options.searchQuery ?? "";
	const { data: session } = authClient.useSession();
	const collections = useCollections();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: projectRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.leftJoin(
					{ repos: collections.githubRepositories },
					({ projects, repos }) => eq(projects.githubRepositoryId, repos.id),
				)
				.where(({ projects }) =>
					eq(projects.organizationId, activeOrganizationId ?? ""),
				)
				.select(({ projects, repos }) => ({
					id: projects.id,
					name: projects.name,
					slug: projects.slug,
					repoCloneUrl: projects.repoCloneUrl,
					githubOwner: repos?.owner ?? null,
					githubRepoName: repos?.name ?? null,
					githubFullName: repos?.fullName ?? null,
					createdAt: projects.createdAt,
					updatedAt: projects.updatedAt,
				})),
		[activeOrganizationId, collections],
	);

	const { data: workspaceRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) =>
					eq(workspaces.organizationId, activeOrganizationId ?? ""),
				)
				.select(({ workspaces }) => ({
					projectId: workspaces.projectId,
				})),
		[activeOrganizationId, collections],
	);

	const workspaceCountByProject = useMemo(() => {
		const counts = new Map<string, number>();
		for (const row of workspaceRows) {
			counts.set(row.projectId, (counts.get(row.projectId) ?? 0) + 1);
		}
		return counts;
	}, [workspaceRows]);

	const enriched = useMemo<AccessibleV2Project[]>(() => {
		const deduped = new Map<string, AccessibleV2Project>();
		for (const row of projectRows) {
			if (deduped.has(row.id)) continue;
			deduped.set(row.id, {
				id: row.id,
				name: row.name,
				slug: row.slug,
				repoCloneUrl: row.repoCloneUrl,
				githubOwner: row.githubOwner ?? null,
				githubRepoName: row.githubRepoName ?? null,
				githubFullName: row.githubFullName ?? null,
				createdAt: new Date(row.createdAt),
				updatedAt: new Date(row.updatedAt),
				workspaceCount: workspaceCountByProject.get(row.id) ?? 0,
			});
		}
		return Array.from(deduped.values()).sort(
			(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
		);
	}, [projectRows, workspaceCountByProject]);

	const filtered = useMemo(
		() =>
			enriched.filter((project) => projectMatchesSearch(project, searchQuery)),
		[enriched, searchQuery],
	);

	return filtered;
}
