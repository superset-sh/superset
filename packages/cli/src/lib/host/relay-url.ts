import type { ApiClient } from "../api-client";
import { env } from "../env";

/**
 * Relay base URL for this user, as decided by the API. Falls back to
 * `env.RELAY_URL` only when the API is unreachable.
 */
export async function getRelayUrl(api: ApiClient): Promise<string> {
	try {
		const endpoint = await api.host.relayEndpoint.query();
		if (endpoint?.url) return endpoint.url;
	} catch {
		// Best-effort — fall back to the default relay.
	}
	return env.RELAY_URL;
}
