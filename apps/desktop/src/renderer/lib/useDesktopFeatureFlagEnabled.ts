import { useEffect, useState } from "react";
import { isPostHogEnabled, posthog } from "./posthog";

type PostHogWithFeatureFlags = typeof posthog & {
	isFeatureEnabled?: (flag: string) => boolean | undefined;
	onFeatureFlags?: (callback: () => void) => void;
};

export function useDesktopFeatureFlagEnabled(flag: string): boolean {
	const [enabled, setEnabled] = useState(false);

	useEffect(() => {
		if (!isPostHogEnabled()) {
			setEnabled(false);
			return;
		}

		let disposed = false;
		const client = posthog as PostHogWithFeatureFlags;
		const sync = () => {
			if (disposed) return;
			setEnabled(client.isFeatureEnabled?.(flag) ?? false);
		};

		sync();
		client.onFeatureFlags?.(sync);

		return () => {
			disposed = true;
		};
	}, [flag]);

	return enabled;
}
