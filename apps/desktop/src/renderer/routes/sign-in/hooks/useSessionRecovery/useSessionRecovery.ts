import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { authClient, getAuthToken } from "renderer/lib/auth-client";

const SESSION_RECOVERY_INTERVAL_MS = 15_000;

export function useSessionRecovery() {
	const {
		data: session,
		isPending,
		isRefetching,
		refetch,
	} = authClient.useSession();
	const isOnline = useOnlineStatus();
	const hasLocalToken = !!getAuthToken();
	const [hasRecoveryAttempted, setHasRecoveryAttempted] = useState(false);
	const recoveryInFlightRef = useRef(false);

	const retrySessionRecovery = useEffectEvent(async () => {
		if (
			!hasLocalToken ||
			!!session?.user ||
			!isOnline ||
			recoveryInFlightRef.current
		) {
			return;
		}

		recoveryInFlightRef.current = true;
		setHasRecoveryAttempted(true);

		try {
			await refetch();
		} catch (error) {
			console.warn("[sign-in] session recovery refetch failed", error);
		} finally {
			recoveryInFlightRef.current = false;
		}
	});

	useEffect(() => {
		if (!hasLocalToken || !!session?.user || !isOnline) {
			return;
		}

		void retrySessionRecovery();

		const interval = window.setInterval(() => {
			void retrySessionRecovery();
		}, SESSION_RECOVERY_INTERVAL_MS);

		const handleWindowFocus = () => {
			void retrySessionRecovery();
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				void retrySessionRecovery();
			}
		};

		window.addEventListener("focus", handleWindowFocus);
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			window.clearInterval(interval);
			window.removeEventListener("focus", handleWindowFocus);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [hasLocalToken, isOnline, session?.user]);

	return {
		hasLocalToken,
		isOnline,
		isPending,
		isRecoveringSession:
			hasLocalToken && (isRefetching || !hasRecoveryAttempted),
		isRetryPending: isRefetching,
		retrySessionRecovery,
		session,
	};
}
