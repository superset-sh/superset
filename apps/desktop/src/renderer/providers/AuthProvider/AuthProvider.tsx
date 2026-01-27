import { Spinner } from "@superset/ui/spinner";
import { type ReactNode, useEffect, useState } from "react";
import { authClient, setAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "../../lib/electron-trpc";

/**
 * AuthProvider: Manages token synchronization between memory and encrypted disk storage.
 *
 * Simple flow:
 * 1. Load token from disk on mount
 * 2. Listen for OAuth callback tokens
 * 3. Set in memory via setAuthToken()
 * 4. Layouts handle session checks naturally via authClient.useSession()
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

		// If token exists, set it in memory and refetch session
		if (storedToken?.token && storedToken?.expiresAt) {
			setAuthToken(storedToken.token);
			refetchSession();
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
