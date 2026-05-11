import { FEATURE_FLAGS } from "@superset/shared/constants";
import type { ApiClient } from "../api-client";
import { env } from "../env";

interface RelayUrlPayload {
	url?: string;
}

/**
 * Resolves the relay base URL the host service should tunnel to. Asks the
 * server for the `relay-url-override` PostHog flag payload for the current
 * user and falls back to `env.RELAY_URL` whenever the flag is off, the
 * payload is malformed, or the API call fails. Mirrors the desktop main
 * helper (`apps/desktop/src/main/lib/relay-url`) so the override applies
 * consistently across both spawn paths.
 */
export async function getRelayUrl(api: ApiClient): Promise<string> {
	const fallback = env.RELAY_URL;
	try {
		const payload = (await api.analytics.featureFlagPayload.query({
			key: FEATURE_FLAGS.RELAY_URL_OVERRIDE,
		})) as RelayUrlPayload | null | undefined;
		const override = payload?.url;
		if (typeof override === "string" && override.length > 0) return override;
	} catch {
		// Best-effort — fall back to env if the server is unreachable or
		// returned an unexpected shape.
	}
	return fallback;
}
