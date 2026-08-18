import { FEATURE_FLAGS } from "@superset/shared/constants";
import { env } from "../env";
import { posthog } from "./analytics";

interface RelayUrlPayload {
	url?: string;
}

/**
 * The relay a user's hosts and clients tunnel through. Reads the
 * `relay-url-override` flag for the user; falls back to the default relay when
 * the flag is off or PostHog is unreachable. Every server-side path that
 * reaches a user's host (relay endpoint, automation dispatch, run-now) must
 * resolve through here — a hardcoded default relay silently misses a host
 * that has moved.
 */
export async function resolveUserRelayUrl(userId: string): Promise<string> {
	try {
		const payload = (await posthog.getFeatureFlagPayload(
			FEATURE_FLAGS.RELAY_URL_OVERRIDE,
			userId,
		)) as RelayUrlPayload | null | undefined;
		const override = payload?.url;
		if (typeof override === "string" && override.length > 0) return override;
	} catch {
		// Fall through to the default relay.
	}
	return env.RELAY_URL;
}
