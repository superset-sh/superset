import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "renderer/lib/posthog";

export function TelemetrySync() {
	const { data: telemetryEnabled } =
		electronTrpc.settings.getTelemetryEnabled.useQuery();

	useEffect(() => {
		if (telemetryEnabled === undefined) return;

		if (telemetryEnabled) {
			if (typeof posthog?.opt_in_capturing === "function") {
				posthog.opt_in_capturing();
			}
		} else {
			if (typeof posthog?.opt_out_capturing === "function") {
				posthog.opt_out_capturing();
			}
		}
	}, [telemetryEnabled]);

	return null;
}
