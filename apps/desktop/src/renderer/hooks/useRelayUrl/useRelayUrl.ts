import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagPayload } from "posthog-js/react";
import { env } from "renderer/env.renderer";

interface RelayUrlPayload {
	url?: string;
}

/**
 * Returns the relay base URL the renderer should use for client-side WS opens
 * (terminal, eventBus). Reads the `relay-url-override` PostHog flag payload
 * and falls back to `env.RELAY_URL` when the flag is off or the payload is
 * malformed. Pairs with the main-side helper used at host-service spawn so
 * the tunnel and the client open against the same URL.
 */
export function useRelayUrl(): string {
	const payload = useFeatureFlagPayload(FEATURE_FLAGS.RELAY_URL_OVERRIDE) as
		| RelayUrlPayload
		| undefined;
	const override = payload?.url;
	if (typeof override === "string" && override.length > 0) return override;
	return env.RELAY_URL;
}
