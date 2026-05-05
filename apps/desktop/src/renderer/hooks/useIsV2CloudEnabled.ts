import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";

const IS_DEV = process.env.NODE_ENV === "development";

/**
 * Returns effective v2 state: capability AND preference.
 *
 * - Capability comes from the `v2-cloud` flag (rollout gate).
 * - Preference is the user's explicit toggle if they've made one, otherwise
 *   the `v2-default-on` flag (typically targeted at new accounts via the
 *   `user_created_at` person property — managed in PostHog, not in code).
 */
export function useIsV2CloudEnabled() {
	const remoteV2Enabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.V2_CLOUD) ?? false;
	const v2DefaultOn =
		useFeatureFlagEnabled(FEATURE_FLAGS.V2_DEFAULT_ON) ?? false;
	const optInV2 = useV2LocalOverrideStore((s) => s.optInV2);

	const effectiveOptIn = optInV2 ?? v2DefaultOn;

	if (IS_DEV) {
		return {
			isV2CloudEnabled: effectiveOptIn,
			isRemoteV2Enabled: true,
		};
	}

	return {
		/** The effective value — use this wherever you previously checked the flag directly. */
		isV2CloudEnabled: remoteV2Enabled && effectiveOptIn,
		/** Whether the remote PostHog flag is on (for showing the toggle). */
		isRemoteV2Enabled: remoteV2Enabled,
	};
}
