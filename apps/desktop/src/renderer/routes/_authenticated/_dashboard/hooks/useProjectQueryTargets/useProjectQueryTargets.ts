import { useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostUrls } from "renderer/hooks/host-service/useHostTargetUrl";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { selectServingHostId } from "../useProjectHost/useProjectHost";

export interface ProjectQueryTarget {
	projectId: string;
	projectName: string;
	hostId: string | null;
	hostUrl: string | null;
}

export interface HostQueryTarget {
	/** Host id plus its project set, so key changes reset pagination. */
	key: string;
	hostId: string | null;
	hostUrl: string | null;
	projects: { projectId: string; projectName: string }[];
}

// One GitHub search request can cover every repository a host serves, so
// queries are issued per host rather than per project (rate-limit budget).
export function groupProjectTargetsByHost(
	targets: ProjectQueryTarget[],
): HostQueryTarget[] {
	const byHost = new Map<
		string,
		Omit<HostQueryTarget, "key"> & { hostKey: string }
	>();
	for (const target of targets) {
		const hostKey = target.hostId ?? "";
		const group = byHost.get(hostKey) ?? {
			hostKey,
			hostId: target.hostId,
			hostUrl: target.hostUrl,
			projects: [],
		};
		group.projects.push({
			projectId: target.projectId,
			projectName: target.projectName,
		});
		byHost.set(hostKey, group);
	}
	return [...byHost.values()].map(({ hostKey, ...group }) => ({
		...group,
		key: `${hostKey}\0${group.projects
			.map((project) => project.projectId)
			.join(",")}`,
	}));
}

export function useProjectQueryTargets(projectFilters: string[]) {
	const { projects, isReady } = useHostProjects();
	const { machineId } = useLocalHostService();
	const selectedProjects = useMemo(() => {
		if (projectFilters.length === 0) return projects;
		const selected = new Set(projectFilters);
		return projects.filter((project) => selected.has(project.projectKey));
	}, [projectFilters, projects]);
	const selectedHostIds = useMemo(
		() =>
			Array.from(
				new Set(
					selectedProjects
						.map((project) => selectServingHostId(project.hostIds, machineId))
						.filter((hostId): hostId is string => hostId !== null),
				),
			),
		[selectedProjects, machineId],
	);
	const hostUrls = useHostUrls(selectedHostIds);
	const hostUrlById = useMemo(
		() => new Map(hostUrls.map((target) => [target.hostId, target.url])),
		[hostUrls],
	);
	const targets = useMemo<ProjectQueryTarget[]>(
		() =>
			selectedProjects.map((project) => {
				const hostId = selectServingHostId(project.hostIds, machineId);
				return {
					projectId: project.projectKey,
					projectName: project.name,
					hostId,
					hostUrl: hostId ? (hostUrlById.get(hostId) ?? null) : null,
				};
			}),
		[selectedProjects, machineId, hostUrlById],
	);

	return { projects, targets, isReady };
}
