import { type EventBusHandle, getEventBus } from "@superset/workspace-client";
import { getHostServiceWsToken } from "./host-service-auth";

/**
 * The event bus for a host, with this client's credentials attached. Every
 * renderer subscription goes through here rather than calling `getEventBus`
 * directly, so the bearer a host expects — secret, sandbox token or JWT — is
 * resolved in one place.
 */
export function getHostEventBus(hostUrl: string): EventBusHandle {
	return getEventBus(hostUrl, () => getHostServiceWsToken(hostUrl));
}
