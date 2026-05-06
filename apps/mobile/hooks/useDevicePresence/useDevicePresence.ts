import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

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

/**
 * Registers this device once on startup so MCP can verify ownership.
 * No polling — just a single upsert into device_presence.
 */
export function useDevicePresence() {
	const { data: session } = useSession();
	const [deviceId, setDeviceId] = useState<string | null>(null);
	const registeredScopeRef = useRef<string | null>(null);
	const activeOrganizationId = session?.session?.activeOrganizationId;

	useEffect(() => {
		getOrCreateDeviceId().then(setDeviceId);
	}, []);

	useEffect(() => {
		if (!deviceId || !activeOrganizationId) return;
		if (registeredScopeRef.current === activeOrganizationId) return;
		registeredScopeRef.current = activeOrganizationId;

		apiClient.device.registerDevice
			.mutate({
				deviceId,
				deviceName:
					Constants.deviceName ??
					(Platform.OS === "ios" ? "iPhone" : "Android"),
				deviceType: "mobile",
			})
			.catch(() => {
				// Registration can fail when offline — will retry on next app launch
				registeredScopeRef.current = null;
			});
	}, [deviceId, activeOrganizationId]);

	return {
		deviceId,
		isActive: !!deviceId && !!activeOrganizationId,
	};
}
