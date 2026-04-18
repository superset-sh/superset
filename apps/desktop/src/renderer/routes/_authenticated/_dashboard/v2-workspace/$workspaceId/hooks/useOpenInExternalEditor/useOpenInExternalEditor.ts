import { toast } from "@superset/ui/sonner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export interface OpenInExternalEditorOptions {
	line?: number;
	column?: number;
}

export function useOpenInExternalEditor(workspaceId: string) {
	const collections = useCollections();
	const { machineId } = useLocalHostService();
	const { data: workspacesWithHost = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.leftJoin({ hosts: collections.v2Hosts }, ({ workspaces, hosts }) =>
					eq(workspaces.hostId, hosts.id),
				)
				.where(({ workspaces }) => eq(workspaces.id, workspaceId))
				.select(({ hosts }) => ({
					hostMachineId: hosts?.machineId ?? null,
				})),
		[collections, workspaceId],
	);
	const workspaceHost = workspacesWithHost[0];

	return useCallback(
		(path: string, opts?: OpenInExternalEditorOptions) => {
			// Treat unloaded host data as non-local to avoid firing the mutation
			// against a potentially remote workspace before locality is confirmed.
			if (workspaceHost?.hostMachineId !== machineId) {
				toast.error("Can't open remote workspace paths in an external editor");
				return;
			}
			electronTrpcClient.external.openFileInEditor
				.mutate({ path, line: opts?.line, column: opts?.column })
				.catch((error) => {
					console.error("Failed to open in external editor:", error);
					toast.error("Failed to open in external editor");
				});
		},
		[workspaceHost, machineId],
	);
}
