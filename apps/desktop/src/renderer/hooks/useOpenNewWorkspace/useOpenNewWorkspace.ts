import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";

/** Opens the `/new-workspace` create surface. */
export function useOpenNewWorkspace() {
	const navigate = useNavigate();

	return useCallback(
		(projectId?: string | null, hostId?: string) => {
			if (hostId) {
				useNewWorkspaceDraftStore.getState().updateDraft({ hostId });
			}
			if (projectId) {
				useNewWorkspaceDraftStore.getState().selectProject(projectId);
			}
			void navigate({
				to: "/new-workspace",
				search:
					projectId || hostId
						? { projectId: projectId ?? undefined, host: hostId }
						: undefined,
			});
		},
		[navigate],
	);
}

export function useOpenNewWorkspaceForLocalProject() {
	const { machineId } = useLocalHostService();
	const openNewWorkspace = useOpenNewWorkspace();
	return useCallback(
		(projectId: string) => openNewWorkspace(projectId, machineId),
		[machineId, openNewWorkspace],
	);
}

/** Same, with "No project" (session) preselected. */
export function useOpenNewSession() {
	const navigate = useNavigate();

	return useCallback(() => {
		void navigate({ to: "/new-workspace", search: { session: true } });
	}, [navigate]);
}

/**
 * Same, aimed at one host rather than the remembered one — the Cloud
 * section's "+", whose whole point is the target.
 */
export function useOpenNewWorkspaceForHost() {
	const navigate = useNavigate();

	return useCallback(
		(hostId: string) => {
			void navigate({ to: "/new-workspace", search: { host: hostId } });
		},
		[navigate],
	);
}
