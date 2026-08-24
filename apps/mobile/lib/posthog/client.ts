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
 * Ours rather than the provider's so `registerSuperProperties` below can run at
 * import time. Registering from a provider effect instead loses the app's first
 * $screen: child effects run first, so the screen tracker captures before the
 * properties exist (measured — that event went out with no `app_name`).
 */
export const posthog = new PostHog(posthogConfig.apiKey, {
	host: posthogConfig.host,
	enableSessionReplay: posthogConfig.options.enableSessionReplay,
	sessionReplayConfig: posthogConfig.options.sessionReplayConfig,
	// The provider only defaults this on when it builds the client itself.
	captureAppLifecycleEvents: true,
	personProfiles: "identified_only",
});

/** `reset()` clears these along with the anonymous id, so sign-out re-registers. */
export function registerSuperProperties(): void {
	posthog.register({ app_name: "mobile", surface: "mobile" });
}

registerSuperProperties();
