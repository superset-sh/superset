import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useProjectDefaultApp } from "renderer/routes/_authenticated/hooks/useProjectDefaultApp";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface OpenInExternalEditorOptions {
	line?: number;
	column?: number;
}

export function useOpenInExternalEditor(workspaceId: string) {
	const { t } = useLingui();
	const { machineId } = useLocalHostService();
	const { workspaces } = useHostWorkspaces();
	const workspaceRow = workspaces.find((w) => w.id === workspaceId);
	const projectId = workspaceRow?.projectId ?? undefined;

	// Forward the CMD+O choice as an explicit app override; the server only
	// knows the global default.
	const { app: preferredApp } = useProjectDefaultApp(projectId);

	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const worktreePath = workspaceQuery.data?.worktreePath ?? undefined;

	return useCallback(
		(path: string, opts?: OpenInExternalEditorOptions) => {
			if (workspaceRow?.hostId !== machineId) {
				toast.error(
					t({
						message: "Can't open remote workspace paths in an external editor",
					}),
				);
				return;
			}
			electronTrpcClient.external.openFileInEditor
				.mutate({
					path,
					line: opts?.line,
					column: opts?.column,
					worktreePath,
					projectId,
					app: preferredApp,
				})
				.catch((error) => {
					console.error("Failed to open in external editor:", error);
					toast.error(
						t({
							message: "Failed to open in external editor",
						}),
					);
				});
		},
		[workspaceRow, machineId, projectId, t, worktreePath, preferredApp],
	);
}
