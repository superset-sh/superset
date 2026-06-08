import { type ReactNode, useEffect, useEffectEvent, useState } from "react";
import { authClient, setAuthToken, setJwt } from "renderer/lib/auth-client";
import { SupersetLogo } from "renderer/routes/sign-in/components/SupersetLogo/SupersetLogo";
import { electronTrpc } from "../../lib/electron-trpc";

async function refreshAuthJwt(logContext: string): Promise<void> {
	try {
		const res = await authClient.token();
		if (res.data?.token) {
			setJwt(res.data.token);
		}
	} catch (err) {
		console.warn(`[AuthProvider] JWT refresh failed ${logContext}`, err);
	}
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isHydrated, setIsHydrated] = useState(false);
	const { data: session, refetch: refetchSession } = authClient.useSession();
	const syncCliAuthConfigMutation =
		electronTrpc.auth.syncCliAuthConfig.useMutation();

	const { data: storedToken, isSuccess } =
		electronTrpc.auth.getStoredToken.useQuery(undefined, {
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});

	useEffect(() => {
		if (!isSuccess || isHydrated) return;

		let cancelled = false;

		async function hydrate() {
			if (storedToken?.token && storedToken?.expiresAt) {
				const isExpired = new Date(storedToken.expiresAt) < new Date();
				if (!isExpired) {
					setAuthToken(storedToken.token);
					try {
						await refetchSession();
					} catch (err) {
						console.warn(
							"[AuthProvider] session refetch failed during hydration",
							err,
						);
					}
					await refreshAuthJwt("during hydration");
				}
			}
			if (!cancelled) {
				setIsHydrated(true);
			}
		}

		hydrate();
		return () => {
			cancelled = true;
		};
	}, [storedToken, isSuccess, isHydrated, refetchSession]);

	electronTrpc.auth.onTokenChanged.useSubscription(undefined, {
		onData: async (data) => {
			if (data?.token && data?.expiresAt) {
				setAuthToken(null);
				await authClient.signOut({ fetchOptions: { throw: false } });
				setAuthToken(data.token);
				try {
					await refetchSession();
				} catch (err) {
					console.warn(
						"[AuthProvider] session refetch failed after token change",
						err,
					);
				}
				await refreshAuthJwt("after token change");
				setIsHydrated(true);
			} else if (data === null) {
				setAuthToken(null);
				setJwt(null);
				try {
					await refetchSession();
				} catch (err) {
					console.warn(
						"[AuthProvider] session refetch failed after token cleared",
						err,
					);
				}
			}
		},
	});

	useEffect(() => {
		if (!isHydrated) return;

		void refreshAuthJwt("on interval start");
		const interval = setInterval(
			() => void refreshAuthJwt("on interval"),
			50 * 60 * 1000,
		);
		return () => clearInterval(interval);
	}, [isHydrated]);

	const syncCliAuthConfigForSession = useEffectEvent(
		async (organizationId: string | null) => {
			await syncCliAuthConfigMutation.mutateAsync({ organizationId });
		},
	);

	useEffect(() => {
		if (!isHydrated || !storedToken?.token || !storedToken?.expiresAt) return;

		void syncCliAuthConfigForSession(
			session?.session?.activeOrganizationId ?? null,
		).catch((error) => {
			console.warn("[AuthProvider] CLI auth config sync failed", error);
		});
	}, [
		isHydrated,
		session?.session?.activeOrganizationId,
		storedToken?.expiresAt,
		storedToken?.token,
	]);

	if (!isHydrated) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<SupersetLogo className="h-8 w-auto" gradient />
			</div>
		);
	}

	return <>{children}</>;
}
