import { useCallback, useEffect, useRef, useState } from "react";
import { authClient, setJwt } from "renderer/lib/auth-client";

// Refresh JWT 5 minutes before it expires
const JWT_REFRESH_BUFFER_MS = 5 * 60 * 1000;

function parseJwtExp(token: string): number | null {
	try {
		const payload = JSON.parse(atob(token.split(".")[1]));
		return typeof payload.exp === "number" ? payload.exp * 1000 : null;
	} catch {
		return null;
	}
}

/**
 * Manages the JWT lifecycle: fetches on demand, caches in memory via setJwt(),
 * and auto-refreshes before expiry. Cleans up the refresh timer on unmount.
 */
export function useJwtRefresh() {
	const [isReady, setIsReady] = useState(false);
	const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

	const fetchJwt = useCallback(async () => {
		try {
			const { data } = await authClient.token();
			if (!data?.token) {
				setJwt(null);
				setIsReady(true);
				return;
			}

			setJwt(data.token);
			setIsReady(true);

			// Schedule next refresh based on token expiry
			const expiresAt = parseJwtExp(data.token);
			if (expiresAt) {
				const refreshIn = Math.max(
					expiresAt - Date.now() - JWT_REFRESH_BUFFER_MS,
					0,
				);
				if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
				refreshTimerRef.current = setTimeout(fetchJwt, refreshIn);
			}
		} catch {
			setJwt(null);
		}
	}, []);

	const clearJwt = useCallback(() => {
		setJwt(null);
		if (refreshTimerRef.current) {
			clearTimeout(refreshTimerRef.current);
			refreshTimerRef.current = null;
		}
	}, []);

	useEffect(() => {
		return () => {
			if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
		};
	}, []);

	return { fetchJwt, clearJwt, isReady };
}
