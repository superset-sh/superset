import { SUPERSET_USER_ID_HEADER } from "@superset/shared/host-routing";

/**
 * Headers forwarded to a host over its tunnel. The relay is the only party
 * that verified the caller's JWT, so it is the one that names the user: the
 * user-id header is always set from the verified subject, and any value the
 * client supplied is discarded rather than passed through. `host` and
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
