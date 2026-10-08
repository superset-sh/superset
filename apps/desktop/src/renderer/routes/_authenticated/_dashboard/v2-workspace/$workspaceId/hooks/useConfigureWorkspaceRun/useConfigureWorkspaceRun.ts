import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useSetSettingsSearchQuery } from "renderer/stores/settings-state";
import type { WorkspaceRunDefinition } from "shared/workspace-run-definition";

export function useConfigureWorkspaceRun(
	projectId: string | null,
	definition: WorkspaceRunDefinition | null,
) {
	const navigate = useNavigate();
	const setSettingsSearchQuery = useSetSettingsSearchQuery();

	return useCallback(() => {
		if (definition?.source === "terminal-preset") {
			void navigate({
				to: "/settings/terminal",
				search: { editPresetId: definition.presetId },
			});
			return;
		}

		// Sessions have no project settings page; global presets are the only
		// configurable run source, handled by the terminal-preset branch above.
		if (projectId === null) {
			void navigate({ to: "/settings/terminal" });
			return;
		}
		setSettingsSearchQuery("scripts");
		void navigate({
			to: "/settings/projects/$projectId",
			params: { projectId },
		});
	}, [definition, navigate, projectId, setSettingsSearchQuery]);
}
