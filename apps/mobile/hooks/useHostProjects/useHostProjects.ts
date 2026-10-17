import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { WorkspacesHost } from "@/hooks/useHostWorkspaces";
import {
	getHostServiceClientByUrl,
	type HostProjectRow,
	hostServiceUrl,
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
	// Custom local-first icon wins; fall back to the GitHub owner avatar.
	const iconUrl =
		row.icon ??
		(repoOwner ? `https://github.com/${repoOwner}.png?size=64` : null);
	return {
		id: row.id,
		name: row.name || row.repoPath.split(/[\\/]/).pop() || row.id,
		iconUrl,
		repoOwner,
		repoName: row.repoName ?? null,
	};
}

export interface UseHostProjectsResult {
	projects: HostProjectItem[];
	/** True once the host answered or failed. Gates empty states only. */
	isReady: boolean;
}

export interface UseHostsProjectsResult {
	projectsByHost: Readonly<Record<string, HostProjectItem[]>>;
	/** True once every host answered or failed. Gates empty states only. */
	isReady: boolean;
}

const NO_PROJECTS: HostProjectItem[] = [];

/**
 * Projects served by each host's `project.list` over the relay — projects
 * are fully local (host.db owns them; the cloud collection is retired), so
 * the host is the only source that includes local-first projects.
 */
export function useHostsProjects(
	hosts: WorkspacesHost[],
): UseHostsProjectsResult {
	// Callers rebuild host objects each render; key on the fields instead.
	const targetsKey = hosts
		.map((host) => `${host.organizationId}/${host.machineId}/${host.isOnline}`)
		.join("|");
	// biome-ignore lint/correctness/useExhaustiveDependencies: targetsKey covers hosts
	const targets = useMemo(
		() =>
			hosts.map((host) => ({
				machineId: host.machineId,
				hostUrl: hostServiceUrl(host.organizationId, host.machineId),
				isOnline: host.isOnline,
			})),
		[targetsKey],
	);

	const combine = useCallback(
		(results: UseQueryResult<HostProjectRow[]>[]) => {
			// A plain object, not a Map, so TanStack's deep sharing applies.
			const projectsByHost: Record<string, HostProjectItem[]> = {};
			let isReady = true;
			targets.forEach(({ machineId, isOnline }, index) => {
				const query = results[index];
				if (!query) return;
				projectsByHost[machineId] = (query.data ?? []).map(toHostProjectItem);
				if (isOnline && !query.isSuccess && !query.isError) isReady = false;
			});
			return { projectsByHost, isReady };
		},
		[targets],
	);

	return useQueries({
		queries: targets.map(({ machineId, hostUrl, isOnline }) => ({
			queryKey: ["host-service", "projects", "list", machineId, hostUrl],
			enabled: isOnline,
			refetchInterval: PROJECTS_REFETCH_INTERVAL_MS,
			networkMode: "always" as const,
			retry: 1,
			queryFn: () => getHostServiceClientByUrl(hostUrl).project.list.query(),
		})),
		combine,
	});
}

export function useHostProjects(
	host: WorkspacesHost | null,
): UseHostProjectsResult {
	const hosts = useMemo(() => (host ? [host] : []), [host]);
	const { projectsByHost, isReady } = useHostsProjects(hosts);
	return {
		projects: (host && projectsByHost[host.machineId]) || NO_PROJECTS,
		isReady,
	};
}
