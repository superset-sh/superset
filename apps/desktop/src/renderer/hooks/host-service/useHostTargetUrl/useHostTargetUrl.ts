import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

/**
 * Resolves a host machineId to a host-service URL. `null` (or `hostId ===
 * machineId`) routes through the local electronTrpc proxy; any other id
 * routes through the relay tunnel.
 */
export function useHostUrl(hostId: string | null | undefined): string | null {
	const { machineId, activeHostUrl } = useLocalHostService();
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId ?? null;

	return useMemo(() => {
		if (hostId === undefined) return null;
		if (hostId === null || hostId === machineId) return activeHostUrl;
		if (!activeOrganizationId) return null;
		const routingKey = buildHostRoutingKey(activeOrganizationId, hostId);
		return `${env.RELAY_URL}/hosts/${routingKey}`;
	}, [hostId, machineId, activeOrganizationId, activeHostUrl]);
}
