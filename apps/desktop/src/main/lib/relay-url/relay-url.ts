import { env } from "main/env.main";

/**
 * Relay URL for the host-service child. The API is authoritative; this only
 * supplies the fallback the child uses when it can't reach the API, since the
 * child re-resolves the endpoint itself once authenticated.
 */
export function getRelayUrl(): string | undefined {
	return env.RELAY_URL;
}
