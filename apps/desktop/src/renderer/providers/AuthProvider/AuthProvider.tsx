import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
	authClient,
	getAuthToken,
	setAuthToken,
	setJwt,
	setSessionUnconfirmed,
	useIsSessionUnconfirmed,
} from "renderer/lib/auth-client";
import { SupersetLogo } from "renderer/routes/sign-in/components/SupersetLogo/SupersetLogo";
import { electronTrpc } from "../../lib/electron-trpc";
import { resolveStoredToken } from "./utils/resolveStoredToken";
import {
	parseSessionSnapshot,
	serializeSessionSnapshot,
	shouldBootFromSavedSession,
} from "./utils/savedSession";
import { signedOutSessionState } from "./utils/signedOutSessionState";

const HYDRATION_TIMEOUT_MS = 15_000;
// With a saved session to start from, a slow server is not worth the wait.
const SAVED_SESSION_PATIENCE_MS = 4_000;
// Capped: unbounded retries against the auth endpoints have locked the whole
// fleet out before (#5518).
const SESSION_RECHECK_DELAYS_MS = [15_000, 30_000, 60_000, 120_000, 300_000];

const sessionAtom = () => authClient.$store.atoms.session;

function readSession(timedOut: boolean) {
	const read = sessionAtom().get();
	return { hasUser: !!read.data?.user, error: read.error, timedOut };
}

function bootFromSavedSession(
	token: string,
	sessionSnapshot: string | null | undefined,
): boolean {
	const saved = parseSessionSnapshot(sessionSnapshot, token);
	if (!saved) return false;
	sessionAtom().set({
		...sessionAtom().get(),
		data: saved,
		error: null,
		isPending: false,
		isRefetching: false,
	});
	setSessionUnconfirmed(true);
	return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isHydrated, setIsHydrated] = useState(false);
	const queryClient = useQueryClient();
	const { data: session, refetch: refetchSession } = authClient.useSession();
	const isSessionUnconfirmed = useIsSessionUnconfirmed();
	const persistSessionSnapshot =
		electronTrpc.auth.persistSessionSnapshot.useMutation();
	const persistedSnapshotRef = useRef<string | null>(null);
	const savedSnapshotRef = useRef<string | null>(null);

	const { data: storedToken, isSuccess } =
		electronTrpc.auth.getStoredToken.useQuery(undefined, {
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});

	useEffect(() => {
		if (!isSuccess || isHydrated) return;

		let cancelled = false;

		async function fetchSessionAndJwt(tokenAtStart: string) {
			try {
				await refetchSession();
			} catch (err) {
				console.warn(
					"[AuthProvider] session refetch failed during hydration",
					err,
				);
			}
			try {
				const res = await authClient.token();
				// A response outliving the hydration timeout must not resurrect a
				// JWT after sign-out or a token change.
				if (res.data?.token && getAuthToken() === tokenAtStart) {
					setJwt(res.data.token);
				}
			} catch (err) {
				console.warn("[AuthProvider] JWT fetch failed during hydration", err);
			}
		}

		async function hydrate() {
			const token = resolveStoredToken(storedToken);
			if (token) {
				setAuthToken(token);
				// A hung session fetch must not hold boot on the splash forever —
				// proceed after a bound; the routes show session-pending UI (#5729).
				const settled = await Promise.race([
					fetchSessionAndJwt(token).then(() => true),
					new Promise<boolean>((resolve) =>
						window.setTimeout(
							() => resolve(false),
							storedToken?.sessionSnapshot
								? SAVED_SESSION_PATIENCE_MS
								: HYDRATION_TIMEOUT_MS,
						),
					),
				]);
				savedSnapshotRef.current = storedToken?.sessionSnapshot ?? null;
				if (
					!cancelled &&
					getAuthToken() === token &&
					shouldBootFromSavedSession(readSession(!settled))
				) {
					bootFromSavedSession(token, savedSnapshotRef.current);
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
				// Swap atomically: a null-token + awaited sign-out gap let a
				// concurrent get-session read "no session" and unmount the whole
				// authenticated tree. The stale JWT re-mints on the next 401.
				setAuthToken(data.token);
				setJwt(null);
				setSessionUnconfirmed(false);
				savedSnapshotRef.current = null;
				persistedSnapshotRef.current = null;
				try {
					await refetchSession();
				} catch (err) {
					console.warn(
						"[AuthProvider] session refetch failed after token change",
						err,
					);
				}
				setIsHydrated(true);
			} else if (data === null) {
				setAuthToken(null);
				setJwt(null);
				setSessionUnconfirmed(false);
				savedSnapshotRef.current = null;
				persistedSnapshotRef.current = null;
				// Cached reads belong to the account that made them, and every
				// window hears this event, not only the one that signed out.
				queryClient.clear();
				sessionAtom().set(signedOutSessionState(sessionAtom().get()));
			}
		},
	});

	useEffect(() => {
		const token = getAuthToken();
		if (!isHydrated || isSessionUnconfirmed || !token || !session?.user) return;
		const sessionSnapshot = serializeSessionSnapshot(session);
		if (persistedSnapshotRef.current === sessionSnapshot) return;
		persistedSnapshotRef.current = sessionSnapshot;
		savedSnapshotRef.current = sessionSnapshot;
		persistSessionSnapshot.mutate({ token, sessionSnapshot });
	}, [
		isHydrated,
		isSessionUnconfirmed,
		session,
		persistSessionSnapshot.mutate,
	]);

	useEffect(() => {
		if (!isSessionUnconfirmed) return;
		let cancelled = false;
		let attempt = 0;
		let timer: number | undefined;
		let inFlight = false;

		const recheck = async () => {
			if (cancelled || inFlight) return;
			inFlight = true;
			const token = getAuthToken();
			try {
				await refetchSession();
			} catch {
				// An unreachable server is what this loop is waiting out.
			}
			inFlight = false;
			if (cancelled || !token || getAuthToken() !== token) return;
			const read = readSession(false);
			if (read.hasUser && !read.error) {
				setSessionUnconfirmed(false);
				return;
			}
			if (!read.hasUser) {
				if (!shouldBootFromSavedSession(read)) {
					// The server answered: there is no session. Signed out for real.
					setSessionUnconfirmed(false);
					return;
				}
				bootFromSavedSession(token, savedSnapshotRef.current);
			}
			schedule();
		};
		const schedule = () => {
			const delay =
				SESSION_RECHECK_DELAYS_MS[
					Math.min(attempt, SESSION_RECHECK_DELAYS_MS.length - 1)
				];
			attempt += 1;
			timer = window.setTimeout(recheck, delay);
		};
		const recheckNow = () => void recheck();

		schedule();
		window.addEventListener("online", recheckNow);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
			window.removeEventListener("online", recheckNow);
		};
	}, [isSessionUnconfirmed, refetchSession]);

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
			<div className="relative flex h-screen w-screen items-center justify-center bg-background">
				<div className="drag absolute inset-x-0 top-0 h-12" />
				<SupersetLogo className="h-8 w-auto" gradient />
			</div>
		);
	}

	return <>{children}</>;
}
