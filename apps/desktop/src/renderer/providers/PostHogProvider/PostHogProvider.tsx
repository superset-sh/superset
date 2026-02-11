import { PostHogProvider as PHProvider } from "posthog-js/react";
import type React from "react";
import { useEffect, useState } from "react";
import { initPostHog, posthog } from "renderer/lib/posthog";

interface PostHogProviderProps {
	children: React.ReactNode;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
	const [isInitialized, setIsInitialized] = useState(false);

	useEffect(() => {
		try {
			initPostHog();
			posthog.capture("desktop_opened");
		} catch (error) {
			console.error("[posthog] Failed to initialize:", error);
		} finally {
			setIsInitialized(true);
		}
	}, []);

	if (!isInitialized) {
		return null;
	}

	return <PHProvider client={posthog}>{children}</PHProvider>;
}
