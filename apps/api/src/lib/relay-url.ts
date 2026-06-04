import { FEATURE_FLAGS } from "@superset/shared/constants";
import { env } from "@/env";
import { posthog } from "@/lib/analytics";

interface RelayUrlPayload {
	url?: string;
}

/**
 * Resolves the relay base URL for a user. Reads the `relay-url-override`
 * PostHog flag payload; falls back to `env.RELAY_URL` when the flag is off,
 * the payload is malformed, or PostHog is unreachable. Mirrors the desktop
 * and CLI relay-url helpers so the Slack agent and external MCP callers reach
 * the same relay the user's host tunneled into (e.g. the staging relay).
 */
export async function getRelayUrl(userId: string): Promise<string> {
	const fallback = env.RELAY_URL;
	try {
		const payload = (await posthog.getFeatureFlagPayload(
			FEATURE_FLAGS.RELAY_URL_OVERRIDE,
			userId,
		)) as RelayUrlPayload | undefined | null;
		const override = payload?.url;
		if (typeof override === "string" && override.length > 0) return override;
	} catch (error) {
		console.warn("[relay-url] PostHog payload fetch failed:", error);
	}
	return fallback;
}
