import { type EventBusHandle, getEventBus } from "@superset/workspace-client";
import {
	getHostServiceWsToken,
	getHostServiceWsUrlParams,
} from "./host-service-auth";

/**
 * The event bus for a host, with this client's credentials attached. Every
 * renderer subscription goes through here rather than calling `getEventBus`
 * directly: a sandbox host needs an extra query param on the socket URL, and
 * a call site that forgot it would connect for local hosts and silently fail
 * to receive anything for cloud ones.
 */
export function getHostEventBus(hostUrl: string): EventBusHandle {
	return getEventBus(
		hostUrl,
		() => getHostServiceWsToken(hostUrl),
		() => getHostServiceWsUrlParams(hostUrl),
	);
}
