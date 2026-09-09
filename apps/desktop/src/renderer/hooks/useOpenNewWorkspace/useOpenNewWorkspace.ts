import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
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
		(projectId?: string | null) => {
			if (!isV2CloudEnabled) {
				useNewWorkspaceModalStore.getState().openModal(projectId ?? undefined);
				return;
			}
			void navigate({
				to: "/new-workspace",
				search: projectId ? { projectId } : undefined,
			});
		},
		[isV2CloudEnabled, navigate],
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
