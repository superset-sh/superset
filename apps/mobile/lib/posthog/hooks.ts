import { isAnalyticsEnabled } from "@superset/shared/optional-analytics";
import {
	useFeatureFlag as sdkUseFeatureFlag,
	usePostHog as sdkUsePostHog,
} from "posthog-react-native";
import { env } from "../env";
import { posthog } from "./client";

const enabled = isAnalyticsEnabled(env.EXPO_PUBLIC_POSTHOG_KEY);
export const useFeatureFlag = enabled
	? sdkUseFeatureFlag
	: (_flag: string) => undefined;
export const usePostHog = enabled ? sdkUsePostHog : () => posthog;
