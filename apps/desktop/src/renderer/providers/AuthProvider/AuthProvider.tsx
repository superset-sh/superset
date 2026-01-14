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
	const { data: storedToken } = electronTrpc.auth.getStoredToken.useQuery(
		undefined,
		{
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		},
	);

	useEffect(() => {
		if (storedToken && !isHydrated) {
			if (storedToken.token && storedToken.expiresAt) {
				setAuthToken(storedToken.token);
				refetchSession();
			}
			setIsHydrated(true);
		}
	}, [storedToken, isHydrated, refetchSession]);

	// Listen for token changes from main process (OAuth callback)
	electronTrpc.auth.onTokenChanged.useSubscription(undefined, {
		onData: (data) => {
			if (data?.token && data?.expiresAt) {
				setAuthToken(data.token);
				setIsHydrated(true);
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
