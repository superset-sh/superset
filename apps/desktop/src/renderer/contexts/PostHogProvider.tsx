import type React from "react";
import { useEffect, useState } from "react";

import { initPostHog } from "../lib/posthog";

interface PostHogProviderProps {
	children: React.ReactNode;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
	const [isInitialized, setIsInitialized] = useState(false);

	useEffect(() => {
		initPostHog();
		setIsInitialized(true);
	}, []);

	// Don't render children until PostHog is initialized
	if (!isInitialized) {
		return null;
	}

	return <>{children}</>;
}
