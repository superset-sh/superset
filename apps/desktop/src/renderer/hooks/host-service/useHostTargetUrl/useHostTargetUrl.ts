import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useMemo } from "react";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { authClient } from "renderer/lib/auth-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface HostUrlContext {
	machineId: string | null;
	activeHostUrl: string | null;
	activeOrganizationId: string | null;
	relayUrl: string;
}

function useHostUrlContext(): HostUrlContext {
	const { machineId, activeHostUrl } = useLocalHostService();
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId ?? null;
	const relayUrl = useRelayUrl();
	return useMemo(
		() => ({ machineId, activeHostUrl, activeOrganizationId, relayUrl }),
		[machineId, activeHostUrl, activeOrganizationId, relayUrl],
	);
}

// Single source of routing truth for both hooks below.
function resolveUrl(
	hostId: string | null,
	{ machineId, activeHostUrl, activeOrganizationId, relayUrl }: HostUrlContext,
): string | null {
	if (hostId === null || hostId === machineId) return activeHostUrl;
	if (!activeOrganizationId) return null;
	return `${relayUrl}/hosts/${buildHostRoutingKey(activeOrganizationId, hostId)}`;
}

/**
 * Resolves a host machineId to a host-service URL. `null` (or `hostId ===
 * machineId`) routes through the local electronTrpc proxy; any other id
 * routes through the relay tunnel.
 */
export function useHostUrl(hostId: string | null | undefined): string | null {
	const context = useHostUrlContext();
	return useMemo(
		() => (hostId === undefined ? null : resolveUrl(hostId, context)),
		[hostId, context],
	);
}

/**
 * List variant of `useHostUrl` for fanning an operation out to every host
 * serving a project. `url` is null for hosts that can't be routed yet.
 */
export function useHostUrls(
	hostIds: string[],
): Array<{ hostId: string; url: string | null; isLocal: boolean }> {
	const context = useHostUrlContext();
	return useMemo(
		() =>
			hostIds.map((hostId) => ({
				hostId,
				url: resolveUrl(hostId, context),
				isLocal: hostId === context.machineId,
			})),
		[hostIds, context],
	);
}
