import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { env } from "renderer/env.renderer";

/**
 * Pure resolver: hostId + machineId + activeHostUrl + organizationId → URL.
 * Hosts other than the local machine are reached via relay; the local
 * machine is reached directly via electronTrpc through `activeHostUrl`.
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
}): string | null {
	if (args.hostId === args.machineId) return args.activeHostUrl;
	const routingKey = buildHostRoutingKey(args.organizationId, args.hostId);
	return `${env.RELAY_URL}/hosts/${routingKey}`;
}
