import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getOutlit } from "renderer/lib/outlit";
import { posthog } from "renderer/lib/posthog";

export function TelemetrySync() {
	const { data: telemetryEnabled } =
		electronTrpc.settings.getTelemetryEnabled.useQuery();

	useEffect(() => {
		if (telemetryEnabled === undefined) return;

		try {
			if (telemetryEnabled) {
				if (typeof posthog?.opt_in_capturing === "function") {
					posthog.opt_in_capturing();
				}
			} else {
				if (typeof posthog?.opt_out_capturing === "function") {
					posthog.opt_out_capturing();
				}
			}

			const outlit = getOutlit();
			if (outlit && telemetryEnabled) {
				outlit.enableTracking();
			}
		} catch (error) {
			console.error(
				"[telemetry-sync] Failed to update telemetry state:",
				error,
			);
		}
	}, [telemetryEnabled]);

	return null;
}
