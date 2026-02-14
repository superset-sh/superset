import { Spinner } from "@superset/ui/spinner";
import { type ReactNode, useEffect, useState } from "react";
import { authClient, setAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "../../lib/electron-trpc";
import { useJwtRefresh } from "./hooks/useJwtRefresh";

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isHydrated, setIsHydrated] = useState(false);
	const { refetch: refetchSession } = authClient.useSession();
	const { fetchJwt, clearJwt, isReady: isJwtReady } = useJwtRefresh();

	const { data: storedToken, isSuccess } =
		electronTrpc.auth.getStoredToken.useQuery(undefined, {
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});

	const [needsJwt, setNeedsJwt] = useState(false);

	useEffect(() => {
		if (!isSuccess || isHydrated) return;

		if (storedToken?.token && storedToken?.expiresAt) {
			const isExpired = new Date(storedToken.expiresAt) < new Date();
			if (!isExpired) {
				setAuthToken(storedToken.token);
				refetchSession().catch(() => {});
				setNeedsJwt(true);
				fetchJwt();
			}
		}

		setIsHydrated(true);
	}, [storedToken, isSuccess, isHydrated, refetchSession, fetchJwt]);

	electronTrpc.auth.onTokenChanged.useSubscription(undefined, {
		onData: async (data) => {
			if (data?.token && data?.expiresAt) {
				setAuthToken(null);
				clearJwt();
				await authClient.signOut({ fetchOptions: { throw: false } });
				setAuthToken(data.token);
				setIsHydrated(true);
				refetchSession();
				fetchJwt();
			} else if (data === null) {
				setAuthToken(null);
				clearJwt();
				refetchSession();
			}
		},
	});

	if (!isHydrated || (needsJwt && !isJwtReady)) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<Spinner className="size-8" />
			</div>
		);
	}

	return <>{children}</>;
}
