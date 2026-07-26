import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { WorkspacesHost } from "@/hooks/useHostWorkspaces";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
	type HostProjectRow,
} from "@/lib/host-service/client";

export interface HostProjectItem {
	id: string;
	name: string;
	iconUrl: string | null;
	repoOwner: string | null;
	repoName: string | null;
}

const PROJECTS_REFETCH_INTERVAL_MS = 30_000;

/**
 * Normalize a project.list row from any host version — hosts on
 * pre-local-first builds don't serve `name`, so fall back to the folder
 * basename (both path separators), matching the desktop rule.
 */
export function toHostProjectItem(
	row: Partial<HostProjectRow> & { id: string; repoPath: string },
): HostProjectItem {
	const repoOwner = row.repoOwner ?? null;
	return {
		id: row.id,
		name: row.name || row.repoPath.split(/[\\/]/).pop() || row.id,
		iconUrl: repoOwner ? `https://github.com/${repoOwner}.png?size=64` : null,
		repoOwner,
		repoName: row.repoName ?? null,
	};
}

export interface UseHostProjectsResult {
	projects: HostProjectItem[];
	/** True once the host answered or failed. Gates empty states only. */
	isReady: boolean;
}

/**
 * Projects served by one host's `project.list` over the relay — projects
 * are fully local (host.db owns them; the cloud collection is retired), so
 * the host is the only source that includes local-first projects.
 */
export function useHostProjects(
	host: WorkspacesHost | null,
): UseHostProjectsResult {
	const hostUrl = host
		? buildRelayHostUrl(host.organizationId, host.machineId)
		: null;

	const query = useQuery({
		queryKey: ["host-service", "projects", "list", host?.machineId, hostUrl],
		enabled: hostUrl !== null && (host?.isOnline ?? false),
		refetchInterval: PROJECTS_REFETCH_INTERVAL_MS,
		networkMode: "always" as const,
		retry: 1,
		queryFn: async () => {
			if (!hostUrl) return [];
			return getHostServiceClientByUrl(hostUrl).project.list.query();
		},
	});

	const projects = useMemo(
		() => (query.data ?? []).map(toHostProjectItem),
		[query.data],
	);

	return {
		projects,
		isReady:
			query.isSuccess ||
			query.isError ||
			host === null ||
			host.isOnline === false,
	};
}
