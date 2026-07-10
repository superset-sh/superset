import { FEATURE_FLAGS } from "@superset/shared/constants";
import posthog from "posthog-js";
import { env } from "../env";

interface RelayUrlPayload {
	url?: string;
}

// Relay base URL for host-service HTTP + WebSocket access. Mirrors the
// desktop's `useRelayUrl`: a `relay-url-override` PostHog flag payload wins,
// otherwise the build-time NEXT_PUBLIC_RELAY_URL.
export function getRelayUrl(): string {
	const payload = posthog.getFeatureFlagPayload(
		FEATURE_FLAGS.RELAY_URL_OVERRIDE,
	) as RelayUrlPayload | undefined;
	const override = payload?.url;
	if (typeof override === "string" && override.length > 0) return override;
	return env.NEXT_PUBLIC_RELAY_URL;
}
