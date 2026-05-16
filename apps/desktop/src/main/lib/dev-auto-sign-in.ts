import { env as mainEnv } from "main/env.main";
import {
	loadToken,
	saveToken,
} from "../../lib/trpc/routers/auth/utils/auth-functions";

const DEV_EMAIL = "admin@local.test";
const DEV_PASSWORD = "supersetdev";
const DEV_NAME = "Local Admin";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

interface SignInResponse {
	token?: string;
	user?: { id: string };
}

interface AuthErrorBody {
	code?: string;
	message?: string;
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
	});
	const data = (await res.json().catch(() => ({}))) as T | AuthErrorBody;
	return { ok: res.ok, status: res.status, data };
}

/**
 * Dev-only: if SKIP_ENV_VALIDATION is set and no usable token is on disk,
 * sign in (or sign up) as the seed admin user and persist the token so
 * the renderer's AuthProvider can hydrate normally — no special renderer code.
 * Best-effort: failure is logged but doesn't crash boot.
 */
export async function ensureDevAuthToken(): Promise<void> {
	if (
		process.env.NODE_ENV !== "development" ||
		!process.env.SKIP_ENV_VALIDATION
	)
		return;

	const stored = await loadToken();
	if (stored.token && stored.expiresAt) {
		const isExpired = new Date(stored.expiresAt) < new Date();
		if (!isExpired) return;
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
