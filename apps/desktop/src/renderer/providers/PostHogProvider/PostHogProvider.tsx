import type React from "react";
import { useEffect } from "react";
import { track } from "renderer/lib/analytics";
import { initPostHog } from "renderer/lib/posthog";
import { electronTrpcClient } from "renderer/lib/trpc-client";

interface PostHogProviderProps {
	children: React.ReactNode;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
	useEffect(() => {
		let cancelled = false;

		(async () => {
			let deviceId: string | undefined;
			try {
				deviceId = (await electronTrpcClient.device.getMachineId.query())
					.machineId;
			} catch (error) {
				console.error("[posthog] Failed to resolve device id:", error);
			}

			if (cancelled) return;

			try {
				await initPostHog(deviceId);
				if (!cancelled) {
					track("desktop_opened");
				}
			} catch (error) {
				console.error("[posthog] Failed to initialize:", error);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	return <>{children}</>;
}
