import { usePostHog } from "posthog-js/react";
import { useEffect, useState } from "react";

interface FlagsClient {
	__loaded?: boolean;
	featureFlags?: { hasLoadedFlags: boolean };
}

/**
 * Flags are as known as they will get: PostHog was never initialized (no
 * key, or init failed), so they never load; or the flags request answered.
 * PostHog marks flags loaded after a failed request too, so a blocked
 * network settles here rather than waiting forever.
 */
export function arePostHogFlagsSettled(
	client: FlagsClient | null | undefined,
): boolean {
	return !client?.__loaded || client.featureFlags?.hasLoadedFlags === true;
}

/** False only while PostHog is initialized and its flags are still loading. */
export function usePostHogFlagsSettled(): boolean {
	const posthog = usePostHog();
	const [settled, setSettled] = useState(() => arePostHogFlagsSettled(posthog));
	useEffect(() => {
		if (arePostHogFlagsSettled(posthog)) {
			setSettled(true);
			return;
		}
		return posthog.onFeatureFlags(() => setSettled(true));
	}, [posthog]);
	return settled;
}
