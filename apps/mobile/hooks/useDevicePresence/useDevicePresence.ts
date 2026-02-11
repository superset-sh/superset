import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

const HEARTBEAT_INTERVAL_MS = 30_000;
const DEVICE_ID_KEY = "superset-device-id";

async function getOrCreateDeviceId(): Promise<string> {
	const existingId = await SecureStore.getItemAsync(DEVICE_ID_KEY).catch(
		() => null,
	);
	if (existingId) return existingId;

	const newId = randomUUID();
	await SecureStore.setItemAsync(DEVICE_ID_KEY, newId).catch(() => {});
	return newId;
}

export function useDevicePresence() {
	const { data: session } = useSession();
	const [deviceId, setDeviceId] = useState<string | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const activeOrganizationId = session?.session?.activeOrganizationId;

	useEffect(() => {
		getOrCreateDeviceId().then(setDeviceId);
	}, []);

	const sendHeartbeat = useCallback(async () => {
		if (!deviceId || !activeOrganizationId) {
			return;
		}

		try {
			await apiClient.device.heartbeat.mutate({
				deviceId,
				deviceName:
					Constants.deviceName ??
					(Platform.OS === "ios" ? "iPhone" : "Android"),
				deviceType: "mobile",
			});
		} catch {
			// Heartbeat can fail when offline - ignore
		}
	}, [deviceId, activeOrganizationId]);

	useEffect(() => {
		if (!deviceId || !activeOrganizationId) return;

		sendHeartbeat();
		intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		};
	}, [deviceId, activeOrganizationId, sendHeartbeat]);

	return {
		deviceId,
		isActive: !!deviceId && !!activeOrganizationId,
	};
}
