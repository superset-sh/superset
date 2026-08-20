import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiClient } from "@/lib/trpc/client";

/**
 * Repo URL prefix per cloud project, for matching PR rows the way host
 * projects are matched: a cloud workspace's project isn't served by the
 * selected host, so its repo coordinates come from the API instead.
 */
export function useCloudRepoPrefixes(
	cloudWorkspaces: Array<{
		projectId: string | null;
		organizationId: string;
	}>,
): Map<string, string> {
	const projects = useMemo(() => {
		const seen = new Map<string, string>();
		for (const row of cloudWorkspaces) {
			if (row.projectId && !seen.has(row.projectId)) {
				seen.set(row.projectId, row.organizationId);
			}
		}
		return [...seen.entries()].map(([projectId, organizationId]) => ({
			projectId,
			organizationId,
		}));
	}, [cloudWorkspaces]);

	const queries = useQueries({
		queries: projects.map((project) => ({
			queryKey: [
				"cloud",
				"cloudWorkspace",
				"repoForProject",
				project.projectId,
			],
			staleTime: Number.POSITIVE_INFINITY,
			queryFn: () => apiClient.cloudWorkspace.repoForProject.query(project),
		})),
	});

	return useMemo(() => {
		const prefixes = new Map<string, string>();
		projects.forEach((project, index) => {
			const repo = queries[index]?.data;
			if (!repo) return;
			prefixes.set(
				project.projectId,
				`https://github.com/${repo.owner}/${repo.name}/`.toLowerCase(),
			);
		});
		return prefixes;
	}, [projects, queries]);
}
