import { type ReactNode, useEffect, useState } from "react";
import { authClient, setAuthToken, setJwt } from "renderer/lib/auth-client";
import { SupersetLogo } from "renderer/routes/sign-in/components/SupersetLogo/SupersetLogo";
import { electronTrpc } from "../../lib/electron-trpc";

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isHydrated, setIsHydrated] = useState(false);
	const { refetch: refetchSession } = authClient.useSession();
	const isDesktopTestMode = window.App.testMode;

	const { data: storedToken, isSuccess } =
		electronTrpc.auth.getStoredToken.useQuery(undefined, {
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});

	useEffect(() => {
		if (!isDesktopTestMode || isHydrated) return;

		let cancelled = false;

		void window.App.automation
			.getStoredAuthToken()
			.then((token) => {
				if (cancelled) return;

				if (token.token && token.expiresAt) {
					const isExpired = new Date(token.expiresAt) < new Date();
					if (!isExpired) {
						setAuthToken(token.token);
						setIsHydrated(true);
						void refetchSession().catch((err) => {
							console.warn(
								"[AuthProvider] session refetch failed during test hydration",
								err,
							);
						});
						return;
					}
				}

				setIsHydrated(true);
			})
			.catch((err) => {
				console.warn(
					"[AuthProvider] test-mode stored token lookup failed",
					err,
				);
				if (!cancelled) {
					setIsHydrated(true);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [isDesktopTestMode, isHydrated, refetchSession]);

	useEffect(() => {
		if (!isSuccess || isHydrated) return;

		let cancelled = false;

		async function hydrate() {
			if (storedToken?.token && storedToken?.expiresAt) {
				const isExpired = new Date(storedToken.expiresAt) < new Date();
				if (!isExpired) {
					setAuthToken(storedToken.token);
					if (!cancelled) {
						setIsHydrated(true);
					}
					void refetchSession().catch((err) => {
						console.warn(
							"[AuthProvider] session refetch failed during hydration",
							err,
						);
					});
					void authClient
						.token()
						.then((res) => {
							if (res.data?.token) {
								setJwt(res.data.token);
							}
						})
						.catch((err) => {
							console.warn(
								"[AuthProvider] JWT fetch failed during hydration",
								err,
							);
						});
					return;
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
				setIsHydrated(true);
				void refetchSession().catch((err) => {
					console.warn(
						"[AuthProvider] session refetch failed after token change",
						err,
					);
				});
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

		const refreshJwt = () =>
			authClient
				.token()
				.then((res) => {
					if (res.data?.token) {
						setJwt(res.data.token);
					}
				})
				.catch((err: unknown) => {
					console.warn("[AuthProvider] JWT refresh failed", err);
				});

		refreshJwt();
		const interval = setInterval(refreshJwt, 50 * 60 * 1000);
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
