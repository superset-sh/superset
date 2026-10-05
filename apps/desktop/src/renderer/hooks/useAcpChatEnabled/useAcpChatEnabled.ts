import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled, usePostHog } from "posthog-js/react";
import { useCallback } from "react";

export type AcpChatAvailability = "enabled" | "disabled" | "resolving";

export function useAcpChatEnabled(): AcpChatAvailability {
	const flag = useFeatureFlagEnabled(FEATURE_FLAGS.ACP_CHAT);
	if (flag === undefined) return "resolving";
	return flag ? "enabled" : "disabled";
}

const RESOLVE_TIMEOUT_MS = 2_000;

export function useAwaitAcpChatEnabled(): () => Promise<boolean> {
	const availability = useAcpChatEnabled();
	const posthog = usePostHog();

	return useCallback(() => {
		if (availability !== "resolving")
			return Promise.resolve(availability === "enabled");
		if (!posthog) return Promise.resolve(false);
		return new Promise<boolean>((resolve) => {
			let unsubscribe: (() => void) | undefined;
			const settle = (enabled: boolean) => {
				clearTimeout(timer);
				unsubscribe?.();
				resolve(enabled);
			};
			const timer = setTimeout(() => settle(false), RESOLVE_TIMEOUT_MS);
			unsubscribe = posthog.onFeatureFlags(() => {
				settle(posthog.isFeatureEnabled(FEATURE_FLAGS.ACP_CHAT) === true);
			});
		});
	}, [availability, posthog]);
}
