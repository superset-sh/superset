import { useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export function selectServingHostId(
	hostIds: string[],
	localMachineId: string | null,
): string | null {
	if (localMachineId && hostIds.includes(localMachineId)) {
		return localMachineId;
	}
	return hostIds[0] ?? null;
}

export function useProjectHost(projectId: string | null) {
	const { projects, isReady } = useHostProjects();
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
		() => selectServingHostId(project?.hostIds ?? [], machineId),
		[machineId, project?.hostIds],
	);

	return {
		hostId,
		isReady,
		project,
		projects,
	};
}
