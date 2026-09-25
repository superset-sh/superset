import { useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import {
	mergeHostTagFoldersWithLegacy,
	useHostTagFolders,
} from "renderer/hooks/host-projects/useHostTagFolders";
import { useUserPreferences } from "renderer/hooks/useUserPreferences";
import type { TagFolderContext } from "./workspaceTagFolders";

/**
 * The one presentation context every membership pass shares: host-side tag
 * settings (from the tag-folder fan-out) and the local hidden-folder list.
 * Build it here, not per consumer — two passes with different contexts is
 * the same bug class as two membership derivations.
 */
export function useTagFolderContext(): TagFolderContext {
	const { hostResults: tagFolderHostResults } = useHostTagFolders();
	const { hostResults: projectHostResults } = useHostProjects();
	const { preferences } = useUserPreferences();
	const hiddenTagFolders = preferences.hiddenTagFolders;
	return useMemo(
		() => ({
			tagSettings: mergeHostTagFoldersWithLegacy(
				tagFolderHostResults,
				projectHostResults,
			).map(({ scope, ...setting }) => ({
				projectId: scope,
				...setting,
			})),
			hiddenTagsByProject: new Map(
				Object.entries(hiddenTagFolders).map(([projectId, tags]) => [
					projectId,
					new Set(tags),
				]),
			),
		}),
		[tagFolderHostResults, projectHostResults, hiddenTagFolders],
	);
}
