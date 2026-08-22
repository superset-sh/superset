import { useQueries } from "@tanstack/react-query";
import { compareDesc } from "date-fns";
import { useMemo } from "react";
import { useCloudProjects } from "@/hooks/useCloudProjects";
import { toHostProjectItem } from "@/hooks/useHostProjects";
import { useHostsPresence } from "@/hooks/useHostsPresence";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { useOrgHosts } from "@/hooks/useOrgHosts";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import { useWorkspacesFilterStore } from "../../../../stores/workspacesFilterStore";
import { useNewSessionPreferencesStore } from "../../stores/newSessionPreferencesStore";

export interface NewChatTarget {
	key: string;
	/** A machine's project, or a project a cloud sandbox can be created for. */
	kind: "host" | "cloud";
	projectId: string;
	projectName: string;
	projectIconUrl: string | null;
	/** `CLOUD_TARGET_ID` for cloud targets — a sentinel, not a machine. */
	machineId: string;
	hostName: string;
	/** Empty for cloud targets: there is nothing to address until create. */
	hostUrl: string;
}

/** Sentinel host id for "create this in a cloud sandbox" (desktop's CLOUD_HOST_ID). */
export const CLOUD_TARGET_ID = "cloud";

export function targetKeyFor(projectId: string, machineId: string) {
	return `${projectId}:${machineId}`;
}

/**
 * Everywhere a new chat workspace can be created: all (project, online host)
 * pairs from fanning out `project.list` to every online host, plus a cloud
 * target per API-listed project — available with zero machines online. The
 * default pick: last used target, else the filtered project, else the most
 * recently updated workspace's target.
 */
export function useNewChatTargets(workspaces: HostWorkspaceItem[] = []): {
	targets: NewChatTarget[];
	defaultTarget: NewChatTarget | null;
} {
	const hosts = useOrgHosts();
	const persistedTargetKey = useNewSessionPreferencesStore(
		(state) => state.targetKey,
	);
	const preferencesHydrated = useNewSessionPreferencesStore(
		(state) => state.hasHydrated,
	);
	const filtersHydrated = useWorkspacesFilterStore(
		(state) => state.hasHydrated,
	);

	const presence = useHostsPresence(hosts);
	const onlineHosts = useMemo(
		() =>
			hosts
				.filter((host) => presence?.get(host.machineId) ?? host.isOnline)
				.map((host) => ({
					machineId: host.machineId,
					name: host.name,
					hostUrl: hostServiceUrl(host.organizationId, host.machineId),
				})),
		[hosts, presence],
	);

	const projectListQueries = useQueries({
		queries: onlineHosts.map((host) => ({
			queryKey: ["host-service", "projects", "list", host.machineId],
			queryFn: () =>
				getHostServiceClientByUrl(host.hostUrl).project.list.query(),
			staleTime: 60_000,
			retry: 1,
			networkMode: "always" as const,
		})),
	});

	const { projects: cloudProjects } = useCloudProjects();

	const targets = useMemo<NewChatTarget[]>(() => {
		const result: NewChatTarget[] = [];
		onlineHosts.forEach((host, index) => {
			for (const row of projectListQueries[index]?.data ?? []) {
				const project = toHostProjectItem(row);
				result.push({
					key: targetKeyFor(project.id, host.machineId),
					kind: "host",
					projectId: project.id,
					projectName: project.name,
					projectIconUrl: project.iconUrl,
					machineId: host.machineId,
					hostName: host.name,
					hostUrl: host.hostUrl,
				});
			}
		});
		for (const project of cloudProjects) {
			result.push({
				key: targetKeyFor(project.id, CLOUD_TARGET_ID),
				kind: "cloud",
				projectId: project.id,
				projectName: project.name,
				projectIconUrl: project.iconUrl,
				machineId: CLOUD_TARGET_ID,
				hostName: "Cloud",
				hostUrl: "",
			});
		}
		return result.sort((a, b) => a.projectName.localeCompare(b.projectName));
	}, [onlineHosts, projectListQueries, cloudProjects]);

	const defaultTarget = useMemo<NewChatTarget | null>(() => {
		if (targets.length === 0) return null;
		// Both the last used target and the project filter are read back from
		// storage asynchronously — defaulting first would land on the wrong
		// project, and a send in that window would create the workspace there.
		if (!preferencesHydrated || !filtersHydrated) return null;

		const persisted = targets.find(
			(target) => target.key === persistedTargetKey,
		);
		if (persisted) return persisted;

		const sortedWorkspaces = [...workspaces].sort((a, b) =>
			compareDesc(a.updatedAt, b.updatedAt),
		);
		const candidateProjectIds = sortedWorkspaces.map(
			(workspace) => workspace.projectId,
		);
		for (const projectId of candidateProjectIds) {
			const recentWorkspace = sortedWorkspaces.find(
				(workspace) => workspace.projectId === projectId,
			);
			const match =
				targets.find(
					(target) =>
						target.projectId === projectId &&
						target.machineId === recentWorkspace?.hostId,
				) ?? targets.find((target) => target.projectId === projectId);
			if (match) return match;
		}
		return targets[0] ?? null;
	}, [
		targets,
		persistedTargetKey,
		workspaces,
		preferencesHydrated,
		filtersHydrated,
	]);

	return { targets, defaultTarget };
}
