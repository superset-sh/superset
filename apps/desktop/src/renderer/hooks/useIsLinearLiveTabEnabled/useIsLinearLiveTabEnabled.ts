import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";

export function useIsLinearLiveTabEnabled(): boolean {
	return useFeatureFlagEnabled(FEATURE_FLAGS.LINEAR_LIVE_TAB) ?? false;
}
