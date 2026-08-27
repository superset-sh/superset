import type { HostServiceAvailabilityStatus } from "renderer/lib/host-service-unavailable";

/**
 * What the takeover screens say about the local host service, by coordinator
 * status. Shared by WorkspaceLocalHostPendingState (no port ever reported) and
 * WorkspaceHostGate (connection dropped) so the two screens can't drift into
 * telling different stories about the same service.
 */
export const LOCAL_HOST_SERVICE_DETAIL: Record<
	HostServiceAvailabilityStatus,
	string
> = {
	starting:
		"The local host service is still starting up. It should be ready in a few seconds.",
	stopped:
		"The local host service isn't running, so nothing on this device can serve the workspace. Restarting it reattaches your terminals and files — nothing on disk is lost.",
	// The process is up but its port hasn't reached us yet: getProcessStatus
	// polls every second, the connection every five. Never advise a restart
	// here — the service is healthy and this clears itself.
	running: "The local host service just came up. Reconnecting to it now.",
	unknown:
		"The local host service isn't responding. Restarting it usually clears this; if it keeps happening, restart Superset.",
};
