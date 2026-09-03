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
