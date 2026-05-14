import { buildHostRoutingKey } from "@superset/shared/host-routing";

/**
 * Pure resolver: hostId + machineId + activeHostUrl + organizationId → URL.
 * Hosts other than the local machine are reached via relay; the local
 * machine is reached directly via electronTrpc through `activeHostUrl`.
 *
 * Callers fetch `relayUrl` from `useRelayUrl()` so the PostHog override is
 * applied consistently between the renderer's hook-based and store-based
 * call sites.
 *
 * Guaranteed-non-null inputs are typed as required because callers inside
 * `_authenticated/` get organizationId from the route guard. A null at call
 * time is a programmer error, not a runtime UX state.
 */
export function resolveHostUrl(args: {
	hostId: string;
	machineId: string | null;
	activeHostUrl: string | null;
	organizationId: string;
	relayUrl: string;
}): string | null {
	if (args.hostId === args.machineId) return args.activeHostUrl;
	const routingKey = buildHostRoutingKey(args.organizationId, args.hostId);
	return `${args.relayUrl}/hosts/${routingKey}`;
}
