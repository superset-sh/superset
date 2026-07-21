import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";

/**
 * Relay routing key (`<orgId>:<machineId>`) for the host that owns a
 * workspace, or null until the owning host has been resolved.
 */
export function useHostRoutingKey(
	workspaceId: string | undefined,
): string | null {
	const { host } = useWorkspaceHost(workspaceId ?? null);
	if (!host) return null;
	return buildHostRoutingKey(host.organizationId, host.machineId);
}
