import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
	authClient,
	getAuthToken,
	getIsSigningOut,
	getSessionStatus,
	type SessionStatus,
	setAuthToken,
	setIsSigningOut,
	setJwt,
	setSessionStatus,
	useSessionStatus,
} from "renderer/lib/auth-client";
import { SupersetLogo } from "renderer/routes/sign-in/components/SupersetLogo/SupersetLogo";
import { electronTrpc } from "../../lib/electron-trpc";
import { decideSessionRead } from "./utils/decideSessionRead";
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

type SessionState = ReturnType<ReturnType<typeof sessionAtom>["get"]>;
type SavedSession = NonNullable<ReturnType<typeof parseSessionSnapshot>>;

// Session states this file wrote itself, so the listener below never takes
// one for an answer from the server.
const ownWrites = new WeakSet<object>();

function writeSessionState(state: SessionState) {
	ownWrites.add(state);
	sessionAtom().set(state);
}

function keepLastSession(
	lastSession: SavedSession,
	status: Exclude<SessionStatus, "confirmed">,
) {
	writeSessionState({
		...sessionAtom().get(),
		data: lastSession as SessionState["data"],
		error: null,
		isPending: false,
		isRefetching: false,
	});
	setSessionStatus(status);
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isHydrated, setIsHydrated] = useState(false);
	const queryClient = useQueryClient();
	const { data: session, refetch: refetchSession } = authClient.useSession();
	const sessionStatus = useSessionStatus();
	const isSessionEnded = sessionStatus === "ended";
	const persistSessionSnapshot =
		electronTrpc.auth.persistSessionSnapshot.useMutation();
	const persistedSnapshotRef = useRef<string | null>(null);
	const lastSessionRef = useRef<SavedSession | null>(null);

	const { data: storedToken, isSuccess } =
		electronTrpc.auth.getStoredToken.useQuery(undefined, {
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});

	// Subscribed outside React's render cycle on purpose: the listener puts the
	// last session back in the same tick the empty read lands, so no component
	// ever renders signed out and nothing routes to /sign-in.
	useEffect(
		() =>
			sessionAtom().listen((state) => {
				const decision = decideSessionRead({
					userId: state.data?.user?.id ?? null,
					error: state.error,
					isSettled: !state.isPending && !state.isRefetching,
					isOwnWrite: ownWrites.has(state),
					hasToken: !!getAuthToken(),
					isSigningOut: getIsSigningOut(),
					lastUserId: lastSessionRef.current?.user.id ?? null,
				});
				if (decision.type === "confirmed" && state.data) {
					// CollectionsProvider picks a window's organization once per
					// mount; the layout remounts on the user id, and nothing the
					// previous account cached may be there when it does.
					if (decision.accountChanged) queryClient.clear();
					lastSessionRef.current = state.data as SavedSession;
					setSessionStatus("confirmed");
				} else if (
					decision.type === "keep-last-session" &&
					lastSessionRef.current
				) {
					keepLastSession(lastSessionRef.current, decision.status);
				}
			}),
		[queryClient],
	);

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
				const saved = parseSessionSnapshot(storedToken?.sessionSnapshot, token);
				lastSessionRef.current = saved;
				// A hung session fetch must not hold boot on the splash forever —
				// proceed after a bound; the routes show session-pending UI (#5729).
				const settled = await Promise.race([
					fetchSessionAndJwt(token).then(() => true),
					new Promise<boolean>((resolve) =>
						window.setTimeout(
							() => resolve(false),
							saved ? SAVED_SESSION_PATIENCE_MS : HYDRATION_TIMEOUT_MS,
						),
					),
				]);
				// A read that came back was already handled by the listener above;
				// what is left is the read that never came back.
				if (
					!cancelled &&
					saved &&
					getAuthToken() === token &&
					shouldBootFromSavedSession(readSession(!settled))
				) {
					keepLastSession(saved, "unconfirmed");
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
				persistedSnapshotRef.current = null;
				try {
					await refetchSession();
				} catch (err) {
					console.warn(
						"[AuthProvider] session refetch failed after token change",
						err,
					);
				}
				const read = readSession(false);
				if (read.hasUser && read.error) setSessionStatus("unconfirmed");
				setIsHydrated(true);
			} else if (data === null) {
				setAuthToken(null);
				setJwt(null);
				setSessionStatus("confirmed");
				lastSessionRef.current = null;
				persistedSnapshotRef.current = null;
				// Cached reads belong to the account that made them, and every
				// window hears this event, not only the one that signed out.
				queryClient.clear();
				writeSessionState(signedOutSessionState(sessionAtom().get()));
				setIsSigningOut(false);
			}
		},
	});

	useEffect(() => {
		const token = getAuthToken();
		if (
			!isHydrated ||
			sessionStatus !== "confirmed" ||
			!token ||
			!session?.user
		) {
			return;
		}
		const sessionSnapshot = serializeSessionSnapshot(session);
		if (persistedSnapshotRef.current === sessionSnapshot) return;
		persistedSnapshotRef.current = sessionSnapshot;
		persistSessionSnapshot.mutate({ token, sessionSnapshot });
	}, [isHydrated, sessionStatus, session, persistSessionSnapshot.mutate]);

	useEffect(() => {
		// Only "unconfirmed" rechecks. A sign-in the server ended does not come
		// back, so "ended" waits for the user.
		if (sessionStatus !== "unconfirmed") return;
		let cancelled = false;
		let attempt = 0;
		let timer: number | undefined;
		let inFlight = false;

		const recheck = async () => {
			if (cancelled || inFlight) return;
			inFlight = true;
			try {
				await refetchSession();
			} catch {
				// An unreachable server is what this loop is waiting out.
			}
			inFlight = false;
			if (cancelled || getSessionStatus() !== "unconfirmed") return;
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
	}, [sessionStatus, refetchSession]);

	useEffect(() => {
		if (!isHydrated || isSessionEnded) return;

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
	}, [isHydrated, isSessionEnded]);

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
