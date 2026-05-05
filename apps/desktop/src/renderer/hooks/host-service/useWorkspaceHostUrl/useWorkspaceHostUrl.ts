import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export type WorkspaceHostTarget =
	| { status: "loading" }
	| { status: "not-found" }
	| { status: "local-starting"; hostId: string }
	| { status: "ready"; kind: "local" | "remote"; hostId: string; url: string };

/**
 * Resolves a workspace ID to its owning host-service target.
 *
 * The status union lets callers distinguish "still loading the collection"
 * from "local host hasn't booted yet" from "workspace doesn't exist on this
 * client" — three states the previous `string | null` API collapsed into one.
 */
export function useWorkspaceHostTarget(
	workspaceId: string | null,
): WorkspaceHostTarget {
	const collections = useCollections();
	const { machineId, activeHostUrl } = useLocalHostService();

	const { data: workspaceRows = [], isReady } = useLiveQuery(
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
		if (!workspaceId || !isReady) return { status: "loading" };
		if (!match) return { status: "not-found" };
		if (machineId && match.hostId === machineId) {
			if (activeHostUrl) {
				return {
					status: "ready",
					kind: "local",
					hostId: match.hostId,
					url: activeHostUrl,
				};
			}
			return { status: "local-starting", hostId: match.hostId };
		}
		const routingKey = buildHostRoutingKey(match.organizationId, match.hostId);
		return {
			status: "ready",
			kind: "remote",
			hostId: match.hostId,
			url: `${env.RELAY_URL}/hosts/${routingKey}`,
		};
	}, [workspaceId, isReady, match, machineId, activeHostUrl]);
}

/**
 * Backwards-compatible URL-only form for existing callers. Returns null
 * for any non-`ready` status (loading, local-starting, not-found).
 */
export function useWorkspaceHostUrl(workspaceId: string | null): string | null {
	const target = useWorkspaceHostTarget(workspaceId);
	return target.status === "ready" ? target.url : null;
}
