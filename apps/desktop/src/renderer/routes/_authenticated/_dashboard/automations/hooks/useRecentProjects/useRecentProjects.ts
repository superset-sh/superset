import { useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import type { ProjectOption } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";

export function useRecentProjects(): ProjectOption[] {
	// Projects are fully local — the host fan-out is the only source that
	// includes local-first projects (the frozen cloud collection never will).
	const { projects: hostProjects } = useHostProjects();

	return useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.projectKey,
				name: project.name,
				githubOwner: project.repoOwner,
				githubRepoName: project.repoName,
				iconUrl: project.repoOwner
					? `https://github.com/${project.repoOwner}.png?size=64`
					: null,
				needsSetup: null,
			})),
		[hostProjects],
	);
}
