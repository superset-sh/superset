import { Spinner } from "@superset/ui/spinner";
import { type ReactNode, useEffect, useState } from "react";
import { authClient, setAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "../../lib/electron-trpc";

/**
 * AuthProvider: Manages token synchronization between memory and encrypted disk storage.
 *
 * Offline-friendly flow:
 * 1. Load token from disk on mount
 * 2. Check if token is expired locally (no network required)
 * 3. If valid, set in memory and validate session in background
 * 4. Render children immediately - don't block on network
 */
export function AuthProvider({ children }: { children: ReactNode }) {
	const [isHydrated, setIsHydrated] = useState(false);

	// Get session refetch to bust cache when token changes
	const { refetch: refetchSession } = authClient.useSession();

	// Initial hydration: Load token from disk
	const { data: storedToken, isSuccess } =
		electronTrpc.auth.getStoredToken.useQuery(undefined, {
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});

	useEffect(() => {
		// Wait for query to complete before hydrating
		if (!isSuccess || isHydrated) return;

		// If token exists and isn't expired locally, set it and validate in background
		if (storedToken?.token && storedToken?.expiresAt) {
			const isExpired = new Date(storedToken.expiresAt) < new Date();

			if (!isExpired) {
				setAuthToken(storedToken.token);
				// Validate session in background - don't block UI on network
				refetchSession().catch((err) => {
					console.warn("[auth] Background session validation failed:", err);
				});
			}
			// If expired, don't set token - user will be redirected to sign-in
		}

		// Always mark as hydrated once query completes (even if no token)
		setIsHydrated(true);
	}, [storedToken, isSuccess, isHydrated, refetchSession]);

	// Listen for auth events from main process (new auth or sign-out only, not hydration)
	electronTrpc.auth.onTokenChanged.useSubscription(undefined, {
		onData: async (data) => {
			if (data?.token && data?.expiresAt) {
				// New authentication - clear old session state first, then set new token
				setAuthToken(null);
				await authClient.signOut({ fetchOptions: { throw: false } });
				setAuthToken(data.token);
				setIsHydrated(true);
				refetchSession();
			} else if (data === null) {
				// Sign-out
				setAuthToken(null);
				refetchSession();
			}
		},
	});

	// Show loading spinner until initial hydration completes
	if (!isHydrated) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<Spinner className="size-8" />
			</div>
		);
	}

	return <>{children}</>;
}
