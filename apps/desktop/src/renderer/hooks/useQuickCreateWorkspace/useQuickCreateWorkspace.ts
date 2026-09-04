import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";

/**
 * Creates a v2 workspace immediately, skipping the new-workspace modal.
 * `projectIdHint` is the caller's best guess at "current project" (e.g. the
 * open v2 workspace route); when absent it falls back to the last-used
 * project, then the first known project. With no project to infer at all,
 * falls back to opening the modal so the user can add or pick one.
 */
export function useQuickCreateWorkspace() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { machineId } = useLocalHostService();
	const { projects: hostProjects } = useHostProjects();
	const { submit } = useWorkspaceCreates();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();

	return useCallback(
		(projectIdHint?: string | null) => {
			const projectId =
				projectIdHint ??
				useV2WorkspaceCreateDefaultsStore.getState().lastProjectId ??
				hostProjects[0]?.id ??
				null;

			if (!projectId || !machineId) {
				openNewWorkspaceModal();
				return;
			}

			const workspaceId = crypto.randomUUID();
			const { completed } = submit({
				hostId: machineId,
				snapshot: { id: workspaceId, projectId },
			});
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId },
			}).catch((error) => {
				console.error("[QuickCreateWorkspace] failed to open workspace", error);
			});
			toast.promise(
				completed.then((outcome) => {
					if (!outcome.ok) throw new Error(outcome.error);
				}),
				{
					loading: t({
						message: "Creating workspace...",
					}),
					success: t({
						message: "Workspace created",
					}),
					error: (error) =>
						error instanceof Error
							? error.message
							: t({
									message: "Failed to create workspace",
								}),
				},
			);
		},
		[hostProjects, machineId, navigate, openNewWorkspaceModal, submit, t],
	);
}
