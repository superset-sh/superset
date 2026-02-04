import { Spinner } from "@superset/ui/spinner";
import { type ReactNode, useEffect, useState } from "react";
import { authClient, setAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "../../lib/electron-trpc";

/**
 * AuthProvider: Manages token synchronization between memory and encrypted disk storage.
 *
 * Flow:
 * 1. Load token from disk on mount
 * 2. If valid (not expired), set in memory and validate session in background
 * 3. Render children immediately without blocking on network
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
		if (!isSuccess || isHydrated) return;

		if (storedToken?.token && storedToken?.expiresAt) {
			const isExpired = new Date(storedToken.expiresAt) < new Date();
			if (!isExpired) {
				setAuthToken(storedToken.token);
				refetchSession().catch(() => {});
			}
		}

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
