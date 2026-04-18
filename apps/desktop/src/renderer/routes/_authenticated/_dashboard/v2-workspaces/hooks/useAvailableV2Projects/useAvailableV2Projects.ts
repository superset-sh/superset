import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { MOCK_ORG_ID } from "shared/constants";

export interface AvailableV2Project {
	id: string;
	name: string;
	slug: string;
	organizationId: string;
	githubRepositoryId: string | null;
	githubOwner: string | null;
	githubRepoName: string | null;
	createdAt: Date;
}

export interface UseAvailableV2ProjectsResult {
	projects: AvailableV2Project[];
}

interface UseAvailableV2ProjectsOptions {
	searchQuery?: string;
}

function projectMatchesSearch(
	project: AvailableV2Project,
	query: string,
): boolean {
	if (!query.trim()) return true;
	const needle = query.trim().toLowerCase();
	return (
		project.name.toLowerCase().includes(needle) ||
		project.slug.toLowerCase().includes(needle) ||
		(project.githubOwner?.toLowerCase().includes(needle) ?? false) ||
		(project.githubRepoName?.toLowerCase().includes(needle) ?? false)
	);
}

/**
 * Lists cloud projects in the user's active org that are NOT currently
 * pinned in the sidebar. Powers the "Available" section of the workspaces
 * tab. No backing filter — a pinned-and-unbacked project stays in the
 * sidebar, not here (per design D7.3).
 */
export function useAvailableV2Projects(
	options: UseAvailableV2ProjectsOptions = {},
): UseAvailableV2ProjectsResult {
	const searchQuery = options.searchQuery ?? "";
	const { data: session } = authClient.useSession();
	const collections = useCollections();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: rows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.leftJoin(
					{ pins: collections.v2SidebarProjects },
					({ projects, pins }) => eq(projects.id, pins.projectId),
				)
				.leftJoin(
					{ repos: collections.githubRepositories },
					({ projects, repos }) => eq(projects.githubRepositoryId, repos.id),
				)
				.where(({ projects }) =>
					eq(projects.organizationId, activeOrganizationId ?? ""),
				)
				.select(({ projects, pins, repos }) => ({
					id: projects.id,
					name: projects.name,
					slug: projects.slug,
					organizationId: projects.organizationId,
					githubRepositoryId: projects.githubRepositoryId,
					githubOwner: repos?.owner ?? null,
					githubRepoName: repos?.name ?? null,
					createdAt: projects.createdAt,
					pinProjectId: pins?.projectId ?? null,
				})),
		[activeOrganizationId, collections],
	);

	const projects = useMemo<AvailableV2Project[]>(() => {
		const deduped = new Map<string, AvailableV2Project>();
		for (const row of rows) {
			// Left-join to v2SidebarProjects — only rows with no sidebar pin are
			// "available." The antijoin pattern matches useAccessibleV2Workspaces.
			if (row.pinProjectId != null) continue;
			if (deduped.has(row.id)) continue;
			deduped.set(row.id, {
				id: row.id,
				name: row.name,
				slug: row.slug,
				organizationId: row.organizationId,
				githubRepositoryId: row.githubRepositoryId,
				githubOwner: row.githubOwner ?? null,
				githubRepoName: row.githubRepoName ?? null,
				createdAt: new Date(row.createdAt),
			});
		}
		return Array.from(deduped.values())
			.filter((project) => projectMatchesSearch(project, searchQuery))
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	}, [rows, searchQuery]);

	return { projects };
}
