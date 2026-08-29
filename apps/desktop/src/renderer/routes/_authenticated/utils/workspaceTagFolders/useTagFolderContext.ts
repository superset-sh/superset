import { useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import type { TagFolderContext } from "./workspaceTagFolders";

/**
 * The one presentation context every membership pass shares: host-side tag
 * settings (from the project fan-out) and the local hidden-folder list.
 * Build it here, not per consumer — two passes with different contexts is
 * the same bug class as two membership derivations.
 */
export function useTagFolderContext(): TagFolderContext {
	const { projects } = useHostProjects();
	const { preferences } = useV2UserPreferences();
	const hiddenTagFolders = preferences.hiddenTagFolders;
	return useMemo(
		() => ({
			tagSettings: projects.flatMap((project) =>
				(project.tagSettings ?? []).map((setting) => ({
					projectId: project.projectKey,
					...setting,
				})),
			),
			hiddenTagsByProject: new Map(
				Object.entries(hiddenTagFolders).map(([projectId, tags]) => [
					projectId,
					new Set(tags),
				]),
			),
		}),
		[projects, hiddenTagFolders],
	);
}
