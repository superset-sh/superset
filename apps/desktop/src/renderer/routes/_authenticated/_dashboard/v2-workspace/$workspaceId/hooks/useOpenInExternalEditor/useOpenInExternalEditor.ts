import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useV2ProjectDefaultApp } from "renderer/routes/_authenticated/hooks/useV2ProjectDefaultApp";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export interface OpenInExternalEditorOptions {
	line?: number;
	column?: number;
}

export function useOpenInExternalEditor(workspaceId: string) {
	const collections = useCollections();
	const { machineId } = useLocalHostService();
	const { data: workspaceRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) => eq(workspaces.id, workspaceId))
				.select(({ workspaces }) => ({
					hostId: workspaces.hostId,
					projectId: workspaces.projectId ?? null,
				})),
		[collections, workspaceId],
	);
	const workspaceRow = workspaceRows[0];
	const projectId = workspaceRow?.projectId ?? undefined;

	// Forward the v2 CMD+O choice as an explicit app override; the server
	// can't look this up on its own (v2 projects aren't in the v1 localDb).
	const { app: v2PreferredApp } = useV2ProjectDefaultApp(projectId);

	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const worktreePath = workspaceQuery.data?.worktreePath ?? undefined;

	return useCallback(
		(path: string, opts?: OpenInExternalEditorOptions) => {
			if (workspaceRow?.hostId !== machineId) {
				toast.error("Can't open remote workspace paths in an external editor");
				return;
			}
			electronTrpcClient.external.openFileInEditor
				.mutate({
					path,
					line: opts?.line,
					column: opts?.column,
					worktreePath,
					projectId,
					app: v2PreferredApp,
				})
				.catch((error) => {
					console.error("Failed to open in external editor:", error);
					toast.error("Failed to open in external editor");
				});
		},
		[workspaceRow, machineId, projectId, worktreePath, v2PreferredApp],
	);
}
