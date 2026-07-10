import { useEffect } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { authClient } from "renderer/lib/auth-client";
import { posthog } from "renderer/lib/posthog";

export function PostHogSurfaceTagger() {
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id;

	useEffect(() => {
		const surface = isV2CloudEnabled ? "v2" : "v1";
		const surface_source = isV2CloudEnabled ? "opted-in" : "opted-out";

		posthog.register({ surface, surface_source });

		if (!userId) return;

		posthog.people.set({ surface });
		posthog.people.set_once({ onboarded_surface: surface });
		if (isV2CloudEnabled) {
			posthog.people.set_once({
				surface_first_v2_at: new Date().toISOString(),
				surface_ever_v2: true,
			});
		}
	}, [isV2CloudEnabled, userId]);

	return null;
}
