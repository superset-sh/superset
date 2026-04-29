import { buildHostRoutingKey } from "@superset/shared/host-routing";
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

	const { data: workspaceRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) => eq(workspaces.id, workspaceId ?? ""))
				.select(({ workspaces }) => ({
					organizationId: workspaces.organizationId,
					hostId: workspaces.hostId,
				})),
		[collections, workspaceId],
	);

	const match = workspaceId ? (workspaceRows[0] ?? null) : null;

	return useMemo(() => {
		if (!match) return null;
		if (match.hostId === machineId) return activeHostUrl;
		const routingKey = buildHostRoutingKey(match.organizationId, match.hostId);
		return `${env.RELAY_URL}/hosts/${routingKey}`;
	}, [match, machineId, activeHostUrl]);
}
