import {
	DEV_EMAIL,
	DEV_NAME,
	DEV_PASSWORD,
} from "@superset/shared/dev-credentials";
import { DevSignInButton as SharedDevSignInButton } from "@superset/ui/dev-sign-in-button";
import { useNavigate } from "@tanstack/react-router";
import { env } from "renderer/env.renderer";
import { setAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

interface AuthResponse {
	token?: string;
}

interface AuthErrorBody {
	code?: string;
	message?: string;
}

async function postAuth(
	path: string,
	body: Record<string, unknown>,
): Promise<{
	ok: boolean;
	status: number;
	data: AuthResponse | AuthErrorBody;
}> {
	const res = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "omit",
		body: JSON.stringify(body),
	});
	const data = (await res.json().catch(() => ({}))) as
		| AuthResponse
		| AuthErrorBody;
	return { ok: res.ok, status: res.status, data };
}

export function LocalDevSignInButton() {
	const navigate = useNavigate();
	const persistToken = electronTrpc.auth.persistToken.useMutation();

	const onSignIn = async () => {
		let signIn = await postAuth("/api/auth/sign-in/email", {
			email: DEV_EMAIL,
			password: DEV_PASSWORD,
		});

		const errBody = signIn.data as AuthErrorBody;
		if (!signIn.ok && errBody.code === "INVALID_EMAIL_OR_PASSWORD") {
			const signUp = await postAuth("/api/auth/sign-up/email", {
				email: DEV_EMAIL,
				password: DEV_PASSWORD,
				name: DEV_NAME,
			});
			if (!signUp.ok) {
				const signUpError = signUp.data as AuthErrorBody;
				throw new Error(
					signUpError.message ?? `Sign-up failed (${signUp.status})`,
				);
			}
			signIn = await postAuth("/api/auth/sign-in/email", {
				email: DEV_EMAIL,
				password: DEV_PASSWORD,
			});
		}

		if (!signIn.ok) {
			const signInError = signIn.data as AuthErrorBody;
			throw new Error(
				signInError.message ?? `Sign-in failed (${signIn.status})`,
			);
		}

		const token = (signIn.data as AuthResponse).token;
		if (!token) throw new Error("Sign-in did not return a token");

		const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
		await persistToken.mutateAsync({ token, expiresAt });
		setAuthToken(token);
		await navigate({ to: "/workspace", replace: true });
	};

	return <SharedDevSignInButton onSignIn={onSignIn} />;
}
