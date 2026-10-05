import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import { useNewWorkspaceModalStore } from "renderer/stores/new-workspace-modal";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";

/**
 * Opens the new-workspace surface. v2 has no modal — the create surface is
 * the `/new-workspace` route — so this navigates there. v1 installs still
 * open the dialog through the store.
 */
export function useOpenNewWorkspace() {
	const navigate = useNavigate();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { machineId } = useLocalHostService();

	return useCallback(
		(projectId?: string | null, requestedHostId?: string) => {
			if (!isV2CloudEnabled) {
				useNewWorkspaceModalStore.getState().openModal(projectId ?? undefined);
				return;
			}
			const hostId =
				requestedHostId ??
				(projectId ? resolveHandoffHostId(machineId) : undefined);
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
		[isV2CloudEnabled, machineId, navigate],
	);
}

// The cloud host has no project picker, so a project or session handoff must
// leave it. A draft host goes in the URL so the page's restore can't replace it.
function resolveHandoffHostId(machineId: string | null | undefined) {
	const draftHostId = useNewWorkspaceDraftStore.getState().hostId;
	const currentHostId =
		draftHostId ?? useV2WorkspaceCreateDefaultsStore.getState().lastHostId;
	if (currentHostId === CLOUD_HOST_ID) return machineId ?? undefined;
	return draftHostId ?? undefined;
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
	const { machineId } = useLocalHostService();

	return useCallback(() => {
		if (!isV2CloudEnabled) {
			useNewWorkspaceModalStore.getState().openSessionModal();
			return;
		}
		const hostId = resolveHandoffHostId(machineId);
		const draftStore = useNewWorkspaceDraftStore.getState();
		if (hostId) draftStore.updateDraft({ hostId });
		draftStore.selectSession();
		void navigate({
			to: "/new-workspace",
			search: { session: true, host: hostId },
		});
	}, [isV2CloudEnabled, machineId, navigate]);
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
