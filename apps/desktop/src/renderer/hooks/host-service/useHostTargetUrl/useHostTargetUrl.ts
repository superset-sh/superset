import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useMemo } from "react";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
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
	const relayUrl = useRelayUrl();

	return useMemo(() => {
		if (hostId === undefined) return null;
		if (hostId === null || hostId === machineId) return activeHostUrl;
		if (!activeOrganizationId) return null;
		const routingKey = buildHostRoutingKey(activeOrganizationId, hostId);
		return `${relayUrl}/hosts/${routingKey}`;
	}, [hostId, machineId, activeOrganizationId, activeHostUrl, relayUrl]);
}

/**
 * List variant of `useHostUrl` for fanning an operation out to every host
 * serving a project. `url` is null for hosts that can't be routed yet.
 */
export function useHostUrls(
	hostIds: string[],
): Array<{ hostId: string; url: string | null; isLocal: boolean }> {
	const { machineId, activeHostUrl } = useLocalHostService();
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId ?? null;
	const relayUrl = useRelayUrl();

	return useMemo(
		() =>
			hostIds.map((hostId) => {
				const isLocal = hostId === machineId;
				if (isLocal) return { hostId, url: activeHostUrl, isLocal };
				if (!activeOrganizationId) return { hostId, url: null, isLocal };
				const routingKey = buildHostRoutingKey(activeOrganizationId, hostId);
				return { hostId, url: `${relayUrl}/hosts/${routingKey}`, isLocal };
			}),
		[hostIds, machineId, activeOrganizationId, activeHostUrl, relayUrl],
	);
}
