import { useEffect } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { posthog } from "renderer/lib/posthog";
import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";

export function PostHogSurfaceTagger() {
	const { isV2CloudEnabled, isRemoteV2Enabled } = useIsV2CloudEnabled();
	const optInV2 = useV2LocalOverrideStore((s) => s.optInV2);

	useEffect(() => {
		const surface = isV2CloudEnabled ? "v2" : "v1";
		const surface_source = !isRemoteV2Enabled
			? "v2-flag-off"
			: optInV2
				? "opted-in"
				: "opted-out";

		posthog.register({ surface, surface_source });

		posthog.people.set({ surface });
		if (isV2CloudEnabled) {
			posthog.people.set_once({
				surface_first_v2_at: new Date().toISOString(),
				surface_ever_v2: true,
			});
		}
	}, [isV2CloudEnabled, isRemoteV2Enabled, optInV2]);

	return null;
}
