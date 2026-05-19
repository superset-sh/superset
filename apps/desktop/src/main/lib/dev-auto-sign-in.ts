import { isLocalProfile } from "@superset/shared/deployment-profile";
import { env as mainEnv } from "main/env.main";
import {
	loadToken,
	saveToken,
} from "../../lib/trpc/routers/auth/utils/auth-functions";

const DEV_EMAIL = "admin@local.test";
const DEV_PASSWORD = "supersetdev";
const DEV_NAME = "Local Admin";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const DEV_AUTH_TIMEOUT_MS = 8000;

// API may take a few seconds to compile on first dev launch (Turbo starts
// services concurrently). Poll /api/auth/ok before giving up.
const HEALTH_POLL_INTERVAL_MS = 1000;
const HEALTH_POLL_TIMEOUT_MS = 60_000;

interface SignInResponse {
	token?: string;
	user?: { id: string };
}

interface AuthErrorBody {
	code?: string;
	message?: string;
}

interface SessionResponse {
	user?: unknown;
}

async function postAuth<T>(
	path: string,
	body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: T | AuthErrorBody }> {
	const res = await fetch(`${mainEnv.NEXT_PUBLIC_API_URL}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Origin: mainEnv.NEXT_PUBLIC_API_URL,
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(DEV_AUTH_TIMEOUT_MS),
	});
	const data = (await res.json().catch(() => ({}))) as T | AuthErrorBody;
	return { ok: res.ok, status: res.status, data };
}

async function waitForApiReady(): Promise<boolean> {
	const start = Date.now();
	const url = `${mainEnv.NEXT_PUBLIC_API_URL}/api/auth/ok`;
	while (Date.now() - start < HEALTH_POLL_TIMEOUT_MS) {
		try {
			const res = await fetch(url, {
				signal: AbortSignal.timeout(2000),
			});
			if (res.ok) return true;
		} catch {
			// connection refused / timeout — keep polling
		}
		await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
	}
	return false;
}

async function isStoredTokenValid(token: string): Promise<boolean> {
	try {
		const res = await fetch(
			`${mainEnv.NEXT_PUBLIC_API_URL}/api/auth/get-session`,
			{
				headers: { Authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(DEV_AUTH_TIMEOUT_MS),
			},
		);
		if (!res.ok) return false;

		const data = (await res.json().catch(() => null)) as SessionResponse | null;
		return !!data?.user;
	} catch {
		return false;
	}
}

/**
 * Dev-only: in the local profile, sign in (or sign up) as the seed
 * admin user and persist the token so the renderer's AuthProvider can
 * hydrate normally — no special renderer code.
 *
 * Polls the API for readiness before attempting sign-in (Turbo starts
 * services concurrently and the API may still be compiling on first
 * launch). Best-effort: failure is logged but doesn't crash boot.
 */
export async function ensureDevAuthToken(): Promise<void> {
	// Local profile only — internal devs, self-hosters, and prod all use real auth.
	if (!isLocalProfile()) return;

	const stored = await loadToken();
	if (stored.token && stored.expiresAt) {
		const expiresAt = new Date(stored.expiresAt);
		const isExpired =
			Number.isNaN(expiresAt.getTime()) || expiresAt < new Date();
		if (!isExpired) {
			const ready = await waitForApiReady();
			if (!ready) {
				console.warn(
					`[dev-auto-sign-in] API at ${mainEnv.NEXT_PUBLIC_API_URL} did not respond within ${HEALTH_POLL_TIMEOUT_MS}ms — skipping. Use the sign-in form once the API is up.`,
				);
				return;
			}

			if (await isStoredTokenValid(stored.token)) return;

			console.log("[dev-auto-sign-in] stored token is stale; refreshing");
		}
	}

	const ready = await waitForApiReady();
	if (!ready) {
		console.warn(
			`[dev-auto-sign-in] API at ${mainEnv.NEXT_PUBLIC_API_URL} did not respond within ${HEALTH_POLL_TIMEOUT_MS}ms — skipping. Use the sign-in form once the API is up.`,
		);
		return;
	}

	try {
		let signIn = await postAuth<SignInResponse>("/api/auth/sign-in/email", {
			email: DEV_EMAIL,
			password: DEV_PASSWORD,
		});

		const errBody = signIn.data as AuthErrorBody;
		if (!signIn.ok && errBody.code === "INVALID_EMAIL_OR_PASSWORD") {
			const signUp = await postAuth<SignInResponse>("/api/auth/sign-up/email", {
				email: DEV_EMAIL,
				password: DEV_PASSWORD,
				name: DEV_NAME,
			});
			if (!signUp.ok) {
				const e = signUp.data as AuthErrorBody;
				throw new Error(`dev sign-up failed (${signUp.status}): ${e.message}`);
			}
			signIn = await postAuth<SignInResponse>("/api/auth/sign-in/email", {
				email: DEV_EMAIL,
				password: DEV_PASSWORD,
			});
		}

		if (!signIn.ok) {
			const e = signIn.data as AuthErrorBody;
			throw new Error(`dev sign-in failed (${signIn.status}): ${e.message}`);
		}
		const token = (signIn.data as SignInResponse).token;
		if (!token) throw new Error("dev sign-in: no token in response");

		const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
		await saveToken({ token, expiresAt });
		console.log(`[dev-auto-sign-in] signed in as ${DEV_EMAIL}`);
	} catch (err) {
		console.warn(
			`[dev-auto-sign-in] failed (is the API up at ${mainEnv.NEXT_PUBLIC_API_URL}?):`,
			err,
		);
	}
}
