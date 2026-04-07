import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { getRemoteHostUrl } from "renderer/lib/v2-workspace-host";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostService } from "renderer/routes/_authenticated/providers/HostServiceProvider";

/**
 * Resolves a workspace ID to its host-service URL.
 * Local host → localhost port. Remote host → relay proxy URL.
 */
export function useWorkspaceHostUrl(workspaceId: string): string | null {
	const collections = useCollections();
	const { services } = useHostService();

	const { data: workspaceWithHost = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.innerJoin({ hosts: collections.v2Hosts }, ({ workspaces, hosts }) =>
					eq(workspaces.hostId, hosts.id),
				)
				.where(({ workspaces }) => eq(workspaces.id, workspaceId))
				.select(({ workspaces, hosts }) => ({
					hostId: workspaces.hostId,
					hostOrgId: hosts.organizationId,
				})),
		[collections, workspaceId],
	);

	const match = workspaceWithHost[0] ?? null;

	return useMemo(() => {
		if (!match) return null;
		const localService = services.get(match.hostOrgId);
		if (localService) return localService.url;
		return getRemoteHostUrl(match.hostId);
	}, [match, services]);
}
