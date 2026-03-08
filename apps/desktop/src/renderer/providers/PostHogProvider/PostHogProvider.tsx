import { PostHogProvider as PHProvider } from "posthog-js/react";
import type React from "react";
import { useEffect } from "react";
import { track } from "renderer/lib/analytics";
import { initPostHog, posthog } from "renderer/lib/posthog";

interface PostHogProviderProps {
	children: React.ReactNode;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
	useEffect(() => {
		// initPostHog handles its own errors — it will never throw.
		// track() is best-effort; failures should not block the UI.
		initPostHog();
		try {
			track("desktop_opened");
		} catch (error) {
			console.error("[posthog] Failed to track desktop_opened:", error);
		}
	}, []);

	// Render children immediately — analytics must never gate the UI.
	// posthog-js queues calls made before init() completes, so it is safe to
	// wrap children in PHProvider before initPostHog() has been called.
	return <PHProvider client={posthog}>{children}</PHProvider>;
}
