import { useCallback, useEffect, useEffectEvent, useRef } from "react";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { authClient, getAuthToken } from "renderer/lib/auth-client";

export const SESSION_RECOVERY_BASE_DELAY_MS = 15_000;
export const SESSION_RECOVERY_MAX_DELAY_MS = 5 * 60_000; // cap backoff at 5 min
export const SESSION_RECOVERY_MAX_ATTEMPTS = 12; // ~40 min of retries, then idle until a user-driven focus/visibility event

/**
 * Delay (ms) before the next session-recovery attempt, or `null` once the
 * attempt budget is spent (stop polling until a user-driven event re-arms it).
 *
 * Exponential backoff from the base delay, capped, with ±50% jitter. The cap
 * stops a permanently-rejected token from polling forever; the jitter keeps a
 * fleet of stuck clients from synchronizing into waves that trip Vercel's DDoS
 * mitigation. `random` is injectable so the jitter is deterministic in tests.
 */
export function nextRecoveryDelayMs(
	attemptsMade: number,
	random: number = Math.random(),
): number | null {
	if (attemptsMade >= SESSION_RECOVERY_MAX_ATTEMPTS) {
		return null;
	}
	// Clamp to >=1 so a focus/visibility reset that races an in-flight request
	// (attemptsMade === 0 in the finally) still yields the attempt-1 delay band,
	// never a sub-floor value from a negative exponent.
	const step = Math.max(1, attemptsMade);
	const backoff = Math.min(
		SESSION_RECOVERY_BASE_DELAY_MS * 2 ** (step - 1),
		SESSION_RECOVERY_MAX_DELAY_MS,
	);
	// Symmetric ±50% jitter (0.5x–1.5x, centered on the backoff), clamped to the
	// max delay — retries spread across the full band instead of biasing down.
	return Math.min(backoff * (0.5 + random), SESSION_RECOVERY_MAX_DELAY_MS);
}

export function useSessionRecovery() {
	const { data: session, isPending, refetch } = authClient.useSession();
	const isOnline = useOnlineStatus();
	const hasLocalToken = !!getAuthToken();

	const recoveryInFlightRef = useRef(false);
	const attemptRef = useRef(0);
	const timerRef = useRef<number | null>(null);
	const isMountedRef = useRef(true);

	// Empty-dep cleanup runs only on unmount (not on re-runs), so this reliably
	// marks teardown — used to stop an in-flight refetch's finally from arming an
	// orphaned timer after the component is gone.
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	const clearTimer = useCallback(() => {
		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

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
		attemptRef.current += 1;

		try {
			await refetch();
		} catch (error) {
			console.warn("[sign-in] session recovery refetch failed", error);
		} finally {
			recoveryInFlightRef.current = false;

			// Self-schedule the next attempt with bounded backoff + jitter. Without
			// this bound a permanently-rejected token polls /api/auth/get-session
			// forever (15s flat), and a synchronized fleet of such clients can trip
			// Vercel's DDoS mitigation.
			clearTimer();
			const delay = nextRecoveryDelayMs(attemptRef.current);
			if (isMountedRef.current && !session?.user && delay !== null) {
				timerRef.current = window.setTimeout(() => {
					void retrySessionRecovery();
				}, delay);
			}
		}
	});

	// User-driven signals (window focus, tab becoming visible) reset the attempt
	// budget and try once — a fresh bounded burst, not an unbounded extra fire.
	const resetAndRetry = useEffectEvent(() => {
		attemptRef.current = 0;
		clearTimer();
		void retrySessionRecovery();
	});

	useEffect(() => {
		if (!hasLocalToken || !!session?.user || !isOnline) {
			clearTimer();
			return;
		}

		attemptRef.current = 0;
		void retrySessionRecovery();

		const handleWindowFocus = () => {
			resetAndRetry();
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				resetAndRetry();
			}
		};

		window.addEventListener("focus", handleWindowFocus);
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			clearTimer();
			window.removeEventListener("focus", handleWindowFocus);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [hasLocalToken, isOnline, session?.user, clearTimer]);

	return {
		hasLocalToken,
		isPending,
		session,
	};
}
