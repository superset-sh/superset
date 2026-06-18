import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import {
	AUTHENTICATED_SESSION_RECOVERY_TIMEOUT_MS,
	hasAuthenticatedSessionRecoveryTimedOut,
} from "renderer/lib/auth-session-state";

const SESSION_RECOVERY_INTERVAL_MS = 15_000;

export function useSessionRecovery() {
	const { data: session, isPending, refetch } = authClient.useSession();
	const isOnline = useOnlineStatus();
	const hasLocalToken = !!getAuthToken();
	const recoveryInFlightRef = useRef(false);
	const [sessionRecoveryStartedAtMs, setSessionRecoveryStartedAtMs] = useState<
		number | null
	>(null);
	const [sessionRecoveryAttempted, setSessionRecoveryAttempted] =
		useState(false);
	const [sessionRecoveryTimedOut, setSessionRecoveryTimedOut] = useState(false);

	const retrySessionRecovery = useEffectEvent(async () => {
		if (
			!hasLocalToken ||
			!!session?.user ||
			!isOnline ||
			sessionRecoveryTimedOut ||
			recoveryInFlightRef.current
		) {
			return;
		}

		recoveryInFlightRef.current = true;

		try {
			await refetch();
		} catch (error) {
			console.warn("[sign-in] session recovery refetch failed", error);
		} finally {
			recoveryInFlightRef.current = false;
			setSessionRecoveryAttempted(true);
		}
	});

	useEffect(() => {
		if (!hasLocalToken || !!session?.user || !isOnline) {
			setSessionRecoveryStartedAtMs(null);
			setSessionRecoveryAttempted(false);
			setSessionRecoveryTimedOut(false);
			return;
		}

		setSessionRecoveryStartedAtMs((startedAt) => startedAt ?? Date.now());
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

	useEffect(() => {
		if (
			!hasLocalToken ||
			!!session?.user ||
			!isOnline ||
			!sessionRecoveryAttempted
		) {
			return;
		}

		setSessionRecoveryTimedOut(true);
	}, [hasLocalToken, isOnline, session?.user, sessionRecoveryAttempted]);

	useEffect(() => {
		if (
			!hasLocalToken ||
			!!session?.user ||
			!isOnline ||
			sessionRecoveryStartedAtMs === null ||
			sessionRecoveryTimedOut
		) {
			return;
		}

		if (
			hasAuthenticatedSessionRecoveryTimedOut({
				recoveryStartedAtMs: sessionRecoveryStartedAtMs,
			})
		) {
			setSessionRecoveryTimedOut(true);
			return;
		}

		const remainingMs = Math.max(
			AUTHENTICATED_SESSION_RECOVERY_TIMEOUT_MS -
				(Date.now() - sessionRecoveryStartedAtMs),
			0,
		);
		const timeout = window.setTimeout(() => {
			setSessionRecoveryTimedOut(true);
		}, remainingMs);
		return () => window.clearTimeout(timeout);
	}, [
		hasLocalToken,
		isOnline,
		session?.user,
		sessionRecoveryStartedAtMs,
		sessionRecoveryTimedOut,
	]);

	return {
		hasLocalToken,
		isPending,
		session,
		sessionRecoveryTimedOut,
	};
}
