import { useEffect, useState } from "react";
import { posthog } from "./posthog";

export function useFeatureFlagEnabled(flag: string): boolean | undefined {
	const [enabled, setEnabled] = useState(() => posthog.isFeatureEnabled(flag));

	useEffect(() => {
		const sync = () => setEnabled(posthog.isFeatureEnabled(flag));
		sync();
		return posthog.onFeatureFlags(sync);
	}, [flag]);

	return enabled;
}

export function useFeatureFlagPayload<TPayload = unknown>(
	flag: string,
): TPayload | undefined {
	const [payload, setPayload] = useState<TPayload | undefined>(
		() => posthog.getFeatureFlagPayload(flag) as TPayload | undefined,
	);

	useEffect(() => {
		const sync = () =>
			setPayload(posthog.getFeatureFlagPayload(flag) as TPayload | undefined);
		sync();
		return posthog.onFeatureFlags(sync);
	}, [flag]);

	return payload;
}
