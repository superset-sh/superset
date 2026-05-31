import { useEffect } from "react";
import { posthog } from "renderer/lib/posthog";

export function PostHogSurfaceTagger() {
	useEffect(() => {
		posthog.register({ surface: "v2", surface_source: "v2-only" });

		posthog.people.set({ surface: "v2" });
		posthog.people.set_once({
			surface_first_v2_at: new Date().toISOString(),
			surface_ever_v2: true,
		});
	}, []);

	return null;
}
