import { useCallback, useEffect, useRef } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";

const HEARTBEAT_INTERVAL_MS = 30_000;

export function useDevicePresence() {
	const { data: session } = authClient.useSession();
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();

	const sendHeartbeat = useCallback(async () => {
		if (!deviceInfo || !session?.session?.activeOrganizationId) return;

		try {
			await apiTrpcClient.device.heartbeat.mutate({
				deviceId: deviceInfo.deviceId,
				deviceName: deviceInfo.deviceName,
				deviceType: "desktop",
			});
		} catch {
			// Heartbeat can fail when offline - ignore
		}
	}, [deviceInfo, session?.session?.activeOrganizationId]);

	useEffect(() => {
		if (!deviceInfo || !session?.session?.activeOrganizationId) return;

		sendHeartbeat();
		intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		};
	}, [deviceInfo, session?.session?.activeOrganizationId, sendHeartbeat]);

	return {
		deviceInfo,
		isActive: !!deviceInfo && !!session?.session?.activeOrganizationId,
	};
}
