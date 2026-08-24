import { PostHog } from "posthog-react-native";
import { env } from "../env";

export const posthogConfig = {
	apiKey: env.EXPO_PUBLIC_POSTHOG_KEY,
	host: env.EXPO_PUBLIC_POSTHOG_HOST,
	options: {
		enableSessionReplay: true,
		sessionReplayConfig: {
			sampleRate: 1,
			screenshotModeBackgroundCapture: true,
		},
		debug: env.NODE_ENV === "development",
	},
};

/**
 * The client is ours rather than the provider's, so `track` can be a plain
 * function call. Half the events below fire from mutation bodies and zustand
 * stores, where `usePostHog()` is not reachable.
 */
export const posthog = new PostHog(posthogConfig.apiKey, {
	host: posthogConfig.host,
	enableSessionReplay: posthogConfig.options.enableSessionReplay,
	sessionReplayConfig: posthogConfig.options.sessionReplayConfig,
	// PostHogProvider only defaults this on when it builds the client itself.
	// Passing our own means setting it here or silently losing the
	// Application Opened/Installed/Backgrounded events.
	captureAppLifecycleEvents: true,
	// Signed-out visitors were 116 of 132 mobile person rows in 90 days, and
	// not one of them ever reached a screen behind the sign-in wall.
	personProfiles: "identified_only",
});

// Registered here rather than in a provider effect: the screen tracker is a
// child, and child effects run first, so the app's very first $screen would
// have gone out without these. `surface` splits desktop's existing funnels by
// client instead of needing a parallel mobile dashboard, the way v1/v2 do.
posthog.register({ app_name: "mobile", surface: "mobile" });
