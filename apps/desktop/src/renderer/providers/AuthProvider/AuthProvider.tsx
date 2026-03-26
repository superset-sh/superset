import { type ReactNode, useEffect, useEffectEvent, useState } from "react";
import {
	authClient,
	clearAuthState,
	clearAuthTokenState,
	getAuthTokenExpiresAtMs,
	setAuthToken,
	setJwt,
} from "renderer/lib/auth-client";
import { SupersetLogo } from "renderer/routes/sign-in/components/SupersetLogo/SupersetLogo";
import { electronTrpc } from "../../lib/electron-trpc";

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isHydrated, setIsHydrated] = useState(false);
	const [authExpiresAtMs, setAuthExpiresAtMs] = useState<number | null>(null);
	const { refetch: refetchSession } = authClient.useSession();
	const syncHostServiceAuthMutation =
		electronTrpc.hostServiceManager.syncAuth.useMutation();
	const clearStoredAuthMutation = electronTrpc.auth.signOut.useMutation();

	const { data: storedToken, isSuccess } =
		electronTrpc.auth.getStoredToken.useQuery(undefined, {
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});

	const syncHostServiceAuth = useEffectEvent(
		async (token: string | null, expiresAt: string | null, reason: string) => {
			try {
				await syncHostServiceAuthMutation.mutateAsync({
					token,
					expiresAt,
				});
			} catch (err) {
				console.warn(
					`[AuthProvider] host-service auth sync failed ${reason}`,
					err,
				);
			}
		},
	);

	const refetchSessionFor = useEffectEvent(async (reason: string) => {
		try {
			await refetchSession();
		} catch (err) {
			console.warn(`[AuthProvider] session refetch failed ${reason}`, err);
		}
	});

	const refreshJwtFor = useEffectEvent(async (reason: string) => {
		try {
			const res = await authClient.token();
			if (res.data?.token) {
				setJwt(res.data.token);
			}
		} catch (err) {
			console.warn(`[AuthProvider] JWT fetch failed ${reason}`, err);
		}
	});

	const clearLocalAuth = useEffectEvent(async (reason: string) => {
		clearAuthState();
		setAuthExpiresAtMs(null);
		await syncHostServiceAuth(null, null, reason);
		await refetchSessionFor(reason);
	});

	const clearStoredAuthFor = useEffectEvent(async (reason: string) => {
		try {
			await clearStoredAuthMutation.mutateAsync();
		} catch (err) {
			console.warn(`[AuthProvider] failed to clear stored auth ${reason}`, err);
		}
	});

	const clearExpiredAuth = useEffectEvent(async (reason: string) => {
		await clearLocalAuth(reason);
		await clearStoredAuthFor(reason);
	});

	const applyStoredAuth = useEffectEvent(
		async (
			token: string,
			expiresAt: string,
			reason: string,
		): Promise<boolean> => {
			clearAuthTokenState();
			setAuthToken(token, expiresAt);
			const expiresAtMs = getAuthTokenExpiresAtMs();
			if (expiresAtMs === null) {
				await clearExpiredAuth(`${reason} (invalid or expired token)`);
				return false;
			}

			setAuthExpiresAtMs(expiresAtMs);
			await refreshJwtFor(reason);
			await syncHostServiceAuth(token, expiresAt, reason);
			await refetchSessionFor(reason);
			return true;
		},
	);

	useEffect(() => {
		if (!isSuccess || isHydrated) return;

		let cancelled = false;

		async function hydrate() {
			if (storedToken?.token && storedToken?.expiresAt) {
				await applyStoredAuth(
					storedToken.token,
					storedToken.expiresAt,
					"during hydration",
				);
			}
			if (!cancelled) {
				setIsHydrated(true);
			}
		}

		hydrate();
		return () => {
			cancelled = true;
		};
	}, [storedToken, isSuccess, isHydrated]);

	electronTrpc.auth.onTokenChanged.useSubscription(undefined, {
		onData: async (data) => {
			if (data?.token && data?.expiresAt) {
				setAuthExpiresAtMs(null);
				await authClient.signOut({ fetchOptions: { throw: false } });
				await applyStoredAuth(data.token, data.expiresAt, "after token change");
				setIsHydrated(true);
			} else if (data === null) {
				await clearLocalAuth("after token cleared");
			}
		},
	});

	const expireAuth = useEffectEvent(async () => {
		await clearExpiredAuth("after token expiry");
	});

	useEffect(() => {
		if (!isHydrated || authExpiresAtMs === null) return;

		const delay = authExpiresAtMs - Date.now();
		if (delay <= 0) {
			void expireAuth();
			return;
		}

		const timer = window.setTimeout(() => {
			void expireAuth();
		}, delay);

		return () => {
			window.clearTimeout(timer);
		};
	}, [authExpiresAtMs, isHydrated]);

	useEffect(() => {
		if (!isHydrated) return;
		void refreshJwtFor("during periodic refresh");
		const interval = setInterval(
			() => {
				void refreshJwtFor("during periodic refresh");
			},
			50 * 60 * 1000,
		);
		return () => clearInterval(interval);
	}, [isHydrated]);

	if (!isHydrated) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<SupersetLogo className="h-8 w-auto animate-pulse opacity-80" />
			</div>
		);
	}

	return <>{children}</>;
}
