import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

/**
 * Resolves a workspace ID to its host-service URL.
 * Local host → localhost port. Remote host → relay proxy URL.
 */
export function useWorkspaceHostUrl(workspaceId: string | null): string | null {
	const collections = useCollections();
	const { machineId, activeHostUrl } = useLocalHostService();

	const { data: workspaceWithHost = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.leftJoin({ hosts: collections.v2Hosts }, ({ workspaces, hosts }) =>
					eq(workspaces.hostId, hosts.id),
				)
				.where(({ workspaces }) => eq(workspaces.id, workspaceId ?? ""))
				.select(({ workspaces, hosts }) => ({
					hostId: workspaces.hostId,
					hostMachineId: hosts?.machineId ?? null,
				})),
		[collections, workspaceId],
	);

	const match = workspaceId ? (workspaceWithHost[0] ?? null) : null;

	return useMemo(() => {
		if (!match) return null;
		if (match.hostMachineId === machineId) return activeHostUrl;
		return `${env.RELAY_URL}/hosts/${match.hostId}`;
	}, [match, machineId, activeHostUrl]);
}
