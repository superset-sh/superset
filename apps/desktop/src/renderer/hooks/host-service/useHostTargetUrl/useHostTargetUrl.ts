import { useMemo } from "react";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { resolveHostUrl } from "./resolveHostUrl";

interface HostUrlContext {
	machineId: string | null;
	activeHostUrl: string | null;
	activeOrganizationId: string | null;
	relayUrl: string;
}

function useHostUrlContext(): HostUrlContext {
	// Org comes from the host-service context (which is per-window) rather than
	// the shared session, so relay routing targets the window's own org.
	const { machineId, activeHostUrl, activeOrganizationId } =
		useLocalHostService();
	const relayUrl = useRelayUrl();
	return useMemo(
		() => ({ machineId, activeHostUrl, activeOrganizationId, relayUrl }),
		[machineId, activeHostUrl, activeOrganizationId, relayUrl],
	);
}

function resolveUrl(
	hostId: string | null,
	{ machineId, activeHostUrl, activeOrganizationId, relayUrl }: HostUrlContext,
): string | null {
	if (hostId === null) return activeHostUrl;
	if (!activeOrganizationId) return null;
	return resolveHostUrl({
		hostId,
		machineId,
		activeHostUrl,
		organizationId: activeOrganizationId,
		relayUrl,
	});
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
