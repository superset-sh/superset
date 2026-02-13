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
 *
 * Electric JWT tokens are fetched on-demand via async headers in collections.ts
 * using authClient.token() from better-auth's JWT plugin.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
	const [isHydrated, setIsHydrated] = useState(false);
	const { refetch: refetchSession } = authClient.useSession();

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

	electronTrpc.auth.onTokenChanged.useSubscription(undefined, {
		onData: async (data) => {
			if (data?.token && data?.expiresAt) {
				setAuthToken(null);
				await authClient.signOut({ fetchOptions: { throw: false } });
				setAuthToken(data.token);
				setIsHydrated(true);
				refetchSession();
			} else if (data === null) {
				setAuthToken(null);
				refetchSession();
			}
		},
	});

	if (!isHydrated) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<Spinner className="size-8" />
			</div>
		);
	}

	return <>{children}</>;
}
