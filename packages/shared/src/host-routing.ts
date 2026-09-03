/**
 * Routing key the relay uses to identify a host service tunnel. The same
 * physical machine can be a host in multiple orgs, so machineId alone is
 * not unique on the relay's tunnel map — scope it by org.
 *
 * Lives in its own module (not host-info) so the renderer can import it
 * without pulling in node:child_process / node:fs.
 */
export function buildHostRoutingKey(
	organizationId: string,
	machineId: string,
): string {
	return `${organizationId}:${machineId}`;
}

export function parseHostRoutingKey(
	key: string,
): { organizationId: string; machineId: string } | null {
	const idx = key.indexOf(":");
	if (idx <= 0 || idx === key.length - 1) return null;
	return {
		organizationId: key.slice(0, idx),
		machineId: key.slice(idx + 1),
	};
}

/**
 * Request header carrying the id of the user behind a host-service call, so a
 * host can stamp `createdByUserId` on the workspaces it creates. The relay
 * sets it from the verified JWT subject and overwrites anything the client
 * sent; local callers (desktop, CLI) set it themselves and are trusted because
 * they already hold the host's pre-shared secret.
 */
export const SUPERSET_USER_ID_HEADER = "x-superset-user-id";

/**
 * Headers a relay forwards to a host over its tunnel. The relay is the only
 * party that verified the caller's JWT, so it is the one that names the user:
 * the user-id header is always set from the verified subject, and any value
 * the client supplied is discarded rather than passed through. `host` and
 * `authorization` never cross — the tunnel client re-authenticates locally
 * with the host's pre-shared secret.
 */
export function buildUpstreamHeaders(
	incoming: Headers,
	userId: string,
): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const [key, value] of incoming.entries()) {
		if (key === "host" || key === "authorization") continue;
		if (key === SUPERSET_USER_ID_HEADER) continue;
		headers[key] = value;
	}
	headers[SUPERSET_USER_ID_HEADER] = userId;
	return headers;
}
