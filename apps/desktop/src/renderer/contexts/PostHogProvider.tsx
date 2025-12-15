import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import type React from "react";
import { useEffect, useState } from "react";

const POSTHOG_KEY = import.meta.env.NEXT_PUBLIC_POSTHOG_KEY as
	| string
	| undefined;
const POSTHOG_HOST =
	(import.meta.env.NEXT_PUBLIC_POSTHOG_HOST as string | undefined) ||
	"https://us.i.posthog.com";

interface PostHogProviderProps {
	children: React.ReactNode;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
	const [isInitialized, setIsInitialized] = useState(false);

	useEffect(() => {
		if (!POSTHOG_KEY) {
			console.log("[posthog] No PostHog key configured, skipping init");
			setIsInitialized(true);
			return;
		}

		posthog.init(POSTHOG_KEY, {
			api_host: POSTHOG_HOST,
			// Electron apps don't have traditional page views
			capture_pageview: false,
			// Disable session recording for now
			disable_session_recording: true,
			// Persist across sessions
			persistence: "localStorage",
			// Load feature flags on init
			bootstrap: {
				featureFlags: {},
			},
		});

		setIsInitialized(true);
		console.log("[posthog] Initialized");
	}, []);

	// Don't render children until PostHog is initialized (or skipped)
	if (!isInitialized) {
		return null;
	}

	// If no PostHog key, just render children without the provider
	if (!POSTHOG_KEY) {
		return <>{children}</>;
	}

	return <PHProvider client={posthog}>{children}</PHProvider>;
}
