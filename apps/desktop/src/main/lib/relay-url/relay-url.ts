import { FEATURE_FLAGS } from "@superset/shared/constants";
import { env } from "main/env.main";
import { getPosthogClient, getUserId } from "main/lib/analytics";

interface RelayUrlPayload {
	url?: string;
}

/**
 * Returns the relay base URL the host-service should tunnel to. Reads the
 * `relay-url-override` PostHog flag payload for the current user; falls back
 * to `env.RELAY_URL` when PostHog is unavailable, the user isn't identified
 * yet, the flag is off, or the payload is malformed.
 *
 * Mirrors the renderer-side `useRelayUrl` hook so the tunnel and client WS
 * opens land on the same URL.
 */
export async function getRelayUrl(): Promise<string | undefined> {
	const fallback = env.RELAY_URL;
	const client = getPosthogClient();
	const userId = getUserId();
	if (!client || !userId) return fallback;
	try {
		const payload = (await client.getFeatureFlagPayload(
			FEATURE_FLAGS.RELAY_URL_OVERRIDE,
			userId,
		)) as RelayUrlPayload | undefined | null;
		const override = payload?.url;
		if (typeof override === "string" && override.length > 0) return override;
	} catch (err) {
		console.warn("[relay-url] PostHog payload fetch failed:", err);
	}
	return fallback;
}
