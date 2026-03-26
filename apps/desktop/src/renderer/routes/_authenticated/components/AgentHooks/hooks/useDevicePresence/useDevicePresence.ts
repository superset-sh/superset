import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useRef } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";

const HEARTBEAT_INTERVAL_MS = 30_000;

function isUnauthorizedError(error: unknown): boolean {
	return (
		error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED"
	);
}

export function useDevicePresence() {
	const { data: session, refetch: refetchSession } = authClient.useSession();
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const unauthorizedRef = useRef(false);
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const authToken = getAuthToken();
	const authScopeRef = useRef<string | null>(null);
	const authTokenRef = useRef<string | null>(null);
	const authScope = session?.session.id
		? `${session.session.id}:${activeOrganizationId ?? ""}`
		: null;

	useEffect(() => {
		const authChanged =
			authScopeRef.current !== authScope || authTokenRef.current !== authToken;

		authScopeRef.current = authScope;
		authTokenRef.current = authToken;

		if (authChanged) {
			unauthorizedRef.current = false;
		}
	}, [authScope, authToken]);

	const stopHeartbeat = useCallback(() => {
		if (intervalRef.current) {
			clearInterval(intervalRef.current);
			intervalRef.current = null;
		}
	}, []);

	const sendHeartbeat = useCallback(async () => {
		if (
			!deviceInfo ||
			!activeOrganizationId ||
			!authToken ||
			unauthorizedRef.current
		) {
			return;
		}

		try {
			await apiTrpcClient.device.heartbeat.mutate({
				deviceId: deviceInfo.deviceId,
				deviceName: deviceInfo.deviceName,
				deviceType: "desktop",
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
		authToken,
		deviceInfo,
		refetchSession,
		stopHeartbeat,
	]);

	useEffect(() => {
		if (
			!deviceInfo ||
			!activeOrganizationId ||
			!authToken ||
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
		authToken,
		deviceInfo,
		sendHeartbeat,
		stopHeartbeat,
	]);

	return {
		deviceInfo,
		isActive:
			!!deviceInfo &&
			!!activeOrganizationId &&
			!!authToken &&
			!unauthorizedRef.current,
	};
}
