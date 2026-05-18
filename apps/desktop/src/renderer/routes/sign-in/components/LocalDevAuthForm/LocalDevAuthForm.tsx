import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { env } from "renderer/env.renderer";
import { authClient, setAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";

const DEV_EMAIL = "admin@local.test";
const DEV_PASSWORD = "supersetdev";
const DEV_NAME = "Local Admin";
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
		credentials: "include",
		body: JSON.stringify(body),
	});
	const data = (await res.json().catch(() => ({}))) as
		| AuthResponse
		| AuthErrorBody;
	return { ok: res.ok, status: res.status, data };
}

export function LocalDevAuthForm() {
	const navigate = useNavigate();
	const persistToken = electronTrpc.auth.persistToken.useMutation();
	const { refetch } = authClient.useSession();
	const [email, setEmail] = useState(DEV_EMAIL);
	const [password, setPassword] = useState(DEV_PASSWORD);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const onSubmit = async (event: FormEvent) => {
		event.preventDefault();
		setError(null);
		setSubmitting(true);

		try {
			let signIn = await postAuth("/api/auth/sign-in/email", {
				email,
				password,
			});

			const errBody = signIn.data as AuthErrorBody;
			if (
				!signIn.ok &&
				errBody.code === "INVALID_EMAIL_OR_PASSWORD" &&
				email === DEV_EMAIL &&
				password === DEV_PASSWORD
			) {
				const signUp = await postAuth("/api/auth/sign-up/email", {
					email,
					password,
					name: DEV_NAME,
				});
				if (!signUp.ok) {
					const signUpError = signUp.data as AuthErrorBody;
					throw new Error(
						signUpError.message ?? `Sign-up failed (${signUp.status})`,
					);
				}

				signIn = await postAuth("/api/auth/sign-in/email", {
					email,
					password,
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
			await refetch();
			await navigate({ to: "/workspace", replace: true });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Sign-in failed");
			setSubmitting(false);
		}
	};

	return (
		<form className="grid gap-3" onSubmit={onSubmit}>
			<div className="grid gap-1.5">
				<Label htmlFor="local-dev-email" className="text-xs">
					Email
				</Label>
				<Input
					id="local-dev-email"
					type="email"
					autoComplete="email"
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					required
				/>
			</div>
			<div className="grid gap-1.5">
				<Label htmlFor="local-dev-password" className="text-xs">
					Password
				</Label>
				<Input
					id="local-dev-password"
					type="password"
					autoComplete="current-password"
					value={password}
					onChange={(event) => setPassword(event.target.value)}
					required
					minLength={8}
				/>
			</div>
			{error && <p className="text-destructive text-xs">{error}</p>}
			<Button
				type="submit"
				size="lg"
				className="w-full"
				disabled={submitting || persistToken.isPending}
			>
				{submitting || persistToken.isPending ? "Signing in..." : "Sign in"}
			</Button>
		</form>
	);
}
