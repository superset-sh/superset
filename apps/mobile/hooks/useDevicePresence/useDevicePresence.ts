import { TRPCClientError } from "@trpc/client";
import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { authClient, useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

const HEARTBEAT_INTERVAL_MS = 30_000;
const DEVICE_ID_KEY = "superset-device-id";

function isUnauthorizedError(error: unknown): boolean {
	return (
		error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED"
	);
}

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
	const { data: session, refetch: refetchSession } = useSession();
	const [deviceId, setDeviceId] = useState<string | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const unauthorizedRef = useRef(false);
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const authCookie = authClient.getCookie() || null;
	const authScopeRef = useRef<string | null>(null);
	const authCookieRef = useRef<string | null>(null);
	const authScope = session?.session.id
		? `${session.session.id}:${activeOrganizationId ?? ""}`
		: null;

	useEffect(() => {
		const authChanged =
			authScopeRef.current !== authScope ||
			authCookieRef.current !== authCookie;

		authScopeRef.current = authScope;
		authCookieRef.current = authCookie;

		if (authChanged) {
			unauthorizedRef.current = false;
		}
	}, [authScope, authCookie]);

	const stopHeartbeat = useCallback(() => {
		if (intervalRef.current) {
			clearInterval(intervalRef.current);
			intervalRef.current = null;
		}
	}, []);

	useEffect(() => {
		getOrCreateDeviceId().then(setDeviceId);
	}, []);

	const sendHeartbeat = useCallback(async () => {
		if (
			!deviceId ||
			!activeOrganizationId ||
			!authCookie ||
			unauthorizedRef.current
		) {
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
		} catch (error) {
			if (isUnauthorizedError(error)) {
				unauthorizedRef.current = true;
				stopHeartbeat();
				try {
					await refetchSession();
				} catch (refetchError) {
					console.warn(
						"[useDevicePresence] session refetch failed after unauthorized heartbeat",
						refetchError,
					);
				}
				return;
			}

			// Heartbeat can fail when offline - ignore
		}
	}, [
		activeOrganizationId,
		authCookie,
		deviceId,
		refetchSession,
		stopHeartbeat,
	]);

	useEffect(() => {
		if (
			!deviceId ||
			!activeOrganizationId ||
			!authCookie ||
			unauthorizedRef.current
		) {
			stopHeartbeat();
			return;
		}

		void sendHeartbeat();
		intervalRef.current = setInterval(() => {
			void sendHeartbeat();
		}, HEARTBEAT_INTERVAL_MS);

		return stopHeartbeat;
	}, [
		activeOrganizationId,
		authCookie,
		deviceId,
		sendHeartbeat,
		stopHeartbeat,
	]);

	return {
		deviceId,
		isActive:
			!!deviceId &&
			!!activeOrganizationId &&
			!!authCookie &&
			!unauthorizedRef.current,
	};
}
