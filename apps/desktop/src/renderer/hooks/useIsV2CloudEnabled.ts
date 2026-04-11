import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";

/**
 * Returns effective v2 state: remote PostHog flag AND local override.
 * Also returns the raw remote flag so the toggle can be shown conditionally.
 */
export function useIsV2CloudEnabled() {
	const remoteV2Enabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.V2_CLOUD) ?? false;
	const forceV1 = useV2LocalOverrideStore((s) => s.forceV1);

	return {
		/** The effective value — use this wherever you previously checked the flag directly. */
		isV2CloudEnabled: remoteV2Enabled && !forceV1,
		/** Whether the remote PostHog flag is on (for showing the toggle). */
		isRemoteV2Enabled: remoteV2Enabled,
	};
}
