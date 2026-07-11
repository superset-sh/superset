import { useLiveQuery } from "@tanstack/react-db";
import { useQueries } from "@tanstack/react-query";
import { compareDesc } from "date-fns";
import { useMemo } from "react";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { useWorkspacesFilterStore } from "../../../../stores/workspacesFilterStore";
import { useNewChatPreferencesStore } from "../../stores/newChatPreferencesStore";

export interface NewChatTarget {
	key: string;
	projectId: string;
	projectName: string;
	projectIconUrl: string | null;
	machineId: string;
	hostName: string;
	hostUrl: string;
}

export function targetKeyFor(projectId: string, machineId: string) {
	return `${projectId}:${machineId}`;
}

/**
 * All (project, online host) pairs a new chat workspace can be created on,
 * from fanning out `project.list` to every online host, plus the default
 * pick: last used target, else the filtered project, else the most recently
 * updated workspace's target.
 */
export function useNewChatTargets(workspaces: HostWorkspaceItem[] = []): {
	targets: NewChatTarget[];
	defaultTarget: NewChatTarget | null;
} {
	const collections = useCollections();
	const persistedTargetKey = useNewChatPreferencesStore(
		(state) => state.targetKey,
	);
	const projectFilter = useWorkspacesFilterStore(
		(state) => state.projectFilter,
	);

	const { data: hosts } = useLiveQuery(
		(q) => q.from({ v2Hosts: collections.v2Hosts }),
		[collections],
	);
	const { data: projects } = useLiveQuery(
		(q) => q.from({ v2Projects: collections.v2Projects }),
		[collections],
	);

	const onlineHosts = useMemo(
		() =>
			(hosts ?? [])
				.filter((host) => host.isOnline)
				.map((host) => ({
					machineId: host.machineId,
					name: host.name,
					hostUrl: buildRelayHostUrl(host.organizationId, host.machineId),
				})),
		[hosts],
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

	const targets = useMemo<NewChatTarget[]>(() => {
		const projectsById = new Map(
			(projects ?? []).map((project) => [project.id, project]),
		);
		const result: NewChatTarget[] = [];
		onlineHosts.forEach((host, index) => {
			for (const row of projectListQueries[index]?.data ?? []) {
				const project = projectsById.get(row.id);
				if (!project) continue;
				result.push({
					key: targetKeyFor(project.id, host.machineId),
					projectId: project.id,
					projectName: project.name,
					projectIconUrl: project.iconUrl,
					machineId: host.machineId,
					hostName: host.name,
					hostUrl: host.hostUrl,
				});
			}
		});
		return result.sort((a, b) => a.projectName.localeCompare(b.projectName));
	}, [onlineHosts, projectListQueries, projects]);

	const defaultTarget = useMemo<NewChatTarget | null>(() => {
		if (targets.length === 0) return null;

		const persisted = targets.find(
			(target) => target.key === persistedTargetKey,
		);
		if (persisted) return persisted;

		const sortedWorkspaces = [...workspaces].sort((a, b) =>
			compareDesc(a.updatedAt, b.updatedAt),
		);
		const candidateProjectIds = projectFilter
			? [projectFilter]
			: sortedWorkspaces.map((workspace) => workspace.projectId);
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
	}, [targets, persistedTargetKey, projectFilter, workspaces]);

	return { targets, defaultTarget };
}
