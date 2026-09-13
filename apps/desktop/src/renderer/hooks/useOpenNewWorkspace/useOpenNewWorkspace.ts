import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import { useNewWorkspaceModalStore } from "renderer/stores/new-workspace-modal";

/**
 * Opens the new-workspace surface. v2 has no modal — the create surface is
 * the `/new-workspace` route — so this navigates there. v1 installs still
 * open the dialog through the store.
 */
export function useOpenNewWorkspace() {
	const navigate = useNavigate();
	const isV2CloudEnabled = useIsV2CloudEnabled();

	return useCallback(
		(projectId?: string | null, hostId?: string) => {
			if (!isV2CloudEnabled) {
				useNewWorkspaceModalStore.getState().openModal(projectId ?? undefined);
				return;
			}
			if (hostId) {
				useNewWorkspaceDraftStore.getState().updateDraft({ hostId });
			}
			void navigate({
				to: "/new-workspace",
				search:
					projectId || hostId
						? { projectId: projectId ?? undefined, host: hostId }
						: undefined,
			});
		},
		[isV2CloudEnabled, navigate],
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
	const isV2CloudEnabled = useIsV2CloudEnabled();

	return useCallback(() => {
		if (!isV2CloudEnabled) {
			useNewWorkspaceModalStore.getState().openSessionModal();
			return;
		}
		void navigate({ to: "/new-workspace", search: { session: true } });
	}, [isV2CloudEnabled, navigate]);
}

/**
 * Same, aimed at one host rather than the remembered one — the Cloud
 * section's "+", whose whole point is the target.
 */
export function useOpenNewWorkspaceForHost() {
	const navigate = useNavigate();
	const isV2CloudEnabled = useIsV2CloudEnabled();

	return useCallback(
		(hostId: string) => {
			if (!isV2CloudEnabled) {
				useNewWorkspaceModalStore.getState().openHostModal(hostId);
				return;
			}
			void navigate({ to: "/new-workspace", search: { host: hostId } });
		},
		[isV2CloudEnabled, navigate],
	);
}
