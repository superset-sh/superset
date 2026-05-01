import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";

const IS_DEV = process.env.NODE_ENV === "development";

/**
 * Returns effective v2 state: remote PostHog flag AND local opt-in.
 * Also returns the raw remote flag so the toggle can be shown conditionally.
 */
export function useIsV2CloudEnabled() {
	const remoteV2Enabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.V2_CLOUD) ?? false;
	const optInV2 = useV2LocalOverrideStore((s) => s.optInV2);

	if (IS_DEV) {
		return {
			isV2CloudEnabled: optInV2,
			isRemoteV2Enabled: true,
		};
	}

	return {
		/** The effective value — use this wherever you previously checked the flag directly. */
		isV2CloudEnabled: remoteV2Enabled && optInV2,
		/** Whether the remote PostHog flag is on (for showing the toggle). */
		isRemoteV2Enabled: remoteV2Enabled,
	};
}
