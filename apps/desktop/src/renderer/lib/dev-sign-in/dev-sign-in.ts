import {
	DEV_EMAIL,
	DEV_NAME,
	DEV_PASSWORD,
} from "@superset/shared/dev-credentials";
import { env } from "renderer/env.renderer";

const DEV_SESSION_LIFETIME_MS = 1000 * 60 * 60 * 24 * 30;

async function postAuth(path: string, body: Record<string, unknown>) {
	const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "omit",
		body: JSON.stringify(body),
	});
	const data = (await response.json().catch(() => ({}))) as {
		token?: string;
		code?: string;
		message?: string;
	};
	return { ok: response.ok, status: response.status, data };
}

export async function requestDevSignIn(): Promise<{
	token: string;
	expiresAt: string;
}> {
	let result = await postAuth("/api/auth/sign-in/email", {
		email: DEV_EMAIL,
		password: DEV_PASSWORD,
	});
	if (!result.ok && result.data.code === "INVALID_EMAIL_OR_PASSWORD") {
		const signUp = await postAuth("/api/auth/sign-up/email", {
			email: DEV_EMAIL,
			password: DEV_PASSWORD,
			name: DEV_NAME,
		});
		if (!signUp.ok) {
			throw new Error(
				signUp.data.message ?? `Sign-up failed (${signUp.status})`,
			);
		}
		result = await postAuth("/api/auth/sign-in/email", {
			email: DEV_EMAIL,
			password: DEV_PASSWORD,
		});
	}
	if (!result.ok) {
		throw new Error(result.data.message ?? `Sign-in failed (${result.status})`);
	}
	const token = result.data.token;
	if (!token) throw new Error("Sign-in did not return a token");
	return {
		token,
		expiresAt: new Date(Date.now() + DEV_SESSION_LIFETIME_MS).toISOString(),
	};
}
