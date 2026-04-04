import { useEffect } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";

const PRESENCE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Keeps this device visible to MCP by periodically refreshing
 * its presence. Registers immediately on startup, then re-registers
 * every 5 minutes so `list_devices` continues to report the device
 * as online.
 */
export function useDevicePresence() {
	const { data: session } = authClient.useSession();
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();

	useEffect(() => {
		const orgId = session?.session?.activeOrganizationId;
		if (!deviceInfo || !orgId) return;

		const register = () => {
			apiTrpcClient.device.registerDevice
				.mutate({
					deviceId: deviceInfo.deviceId,
					deviceName: deviceInfo.deviceName,
					deviceType: "desktop",
				})
				.catch(() => {});
		};

		register();
		const interval = setInterval(register, PRESENCE_INTERVAL_MS);
		return () => clearInterval(interval);
	}, [deviceInfo, session?.session?.activeOrganizationId]);

	return {
		deviceInfo,
		isActive: !!deviceInfo && !!session?.session?.activeOrganizationId,
	};
}
