import { useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export function selectServingHostId(
	hostIds: string[],
	localMachineId: string | null,
	preferredHostId?: string | null,
): string | null {
	if (preferredHostId) {
		return hostIds.includes(preferredHostId) ? preferredHostId : null;
	}
	if (localMachineId && hostIds.includes(localMachineId)) {
		return localMachineId;
	}
	return hostIds[0] ?? null;
}

export function useProjectHost(
	projectId: string | null,
	preferredHostId?: string | null,
) {
	const { projects, hostResults, isReady } = useHostProjects();
	const { machineId } = useLocalHostService();
	const project = useMemo(
		() =>
			projectId
				? (projects.find((candidate) => candidate.projectKey === projectId) ??
					null)
				: null,
		[projectId, projects],
	);
	const hostId = useMemo(
		() =>
			selectServingHostId(project?.hostIds ?? [], machineId, preferredHostId),
		[machineId, project?.hostIds, preferredHostId],
	);
	const hostProject = useMemo(
		() =>
			hostResults
				.find((result) => result.target.machineId === hostId)
				?.rows?.find((row) => row.id === projectId) ?? null,
		[hostId, hostResults, projectId],
	);

	return {
		hostId,
		hostProject,
		isReady,
		project,
		projects,
	};
}
