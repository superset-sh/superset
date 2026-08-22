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
