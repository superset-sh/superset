import { useQueries } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { isMissingProcedureError } from "renderer/lib/isMissingProcedureError";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { cleanupWorkspacePaneRuntimes } from "renderer/routes/_authenticated/utils/cleanupWorkspacePaneRuntimes";
import type { HostWorkspacesQueryTarget } from "../../useHostWorkspaces.utils";
import { pruneArchivedWorkspaceState } from "./pruneArchivedWorkspaceState";

export function usePruneArchivedWorkspaceState(
	targets: HostWorkspacesQueryTarget[],
	enabled: boolean,
) {
	const { activeOrganizationId, v2WorkspaceLocalState } = useCollections();
	useQueries({
		queries: targets.map((target) => ({
			queryKey: [
				"host-service",
				"workspaces",
				"prune-archived-state",
				target.organizationId,
				target.machineId,
			],
			enabled:
				enabled &&
				target.hostUrl !== null &&
				!target.isSandbox &&
				target.organizationId === activeOrganizationId,
			refetchInterval: 60_000,
			refetchIntervalInBackground: true,
			networkMode: "always" as const,
			retry: false,
			queryFn: async ({ signal }: { signal: AbortSignal }) => {
				if (!target.hostUrl) return null;
				const client = getHostServiceClientByUrl(target.hostUrl);
				try {
					await pruneArchivedWorkspaceState({
						collection: v2WorkspaceLocalState,
						getArchivedIds: (workspaceIds) =>
							client.workspace.getArchivedIds.query(
								{ workspaceIds },
								{ signal },
							),
						signal,
						cleanupRuntimes: cleanupWorkspacePaneRuntimes,
					});
				} catch (error) {
					if (!isMissingProcedureError(error)) throw error;
				}
				return null;
			},
		})),
	});
}
