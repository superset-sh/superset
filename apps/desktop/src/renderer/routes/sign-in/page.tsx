import { type AuthProvider, COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { env } from "renderer/env.renderer";
import { track } from "renderer/lib/analytics";
import { authClient, setAuthToken, setJwt } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { SupersetLogo } from "./components/SupersetLogo";
import { useSessionRecovery } from "./hooks/useSessionRecovery";

export const Route = createFileRoute("/sign-in/")({
	component: SignInPage,
});

type AuthMode = "sign-in" | "sign-up";

interface EmailAuthResponse {
	token?: string | null;
	code?: string;
	message?: string;
}

async function postEmailAuth(
	path: "/api/auth/sign-in/email" | "/api/auth/sign-up/email",
	body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: EmailAuthResponse }> {
	const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "omit",
		body: JSON.stringify(body),
	});
	const data = (await response.json().catch(() => ({}))) as EmailAuthResponse;
	return { ok: response.ok, status: response.status, data };
}

function getEmailAuthError(data: EmailAuthResponse, status: number): string {
	if (data.code === "INVALID_EMAIL_OR_PASSWORD") {
		return "Email or password is incorrect.";
	}
	if (data.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
		return "An account already exists for this email. Sign in instead.";
	}
	if (data.code === "EMAIL_PASSWORD_DISABLED") {
		return "Email and password sign-in is not available.";
	}
	if (data.code === "PASSWORD_TOO_SHORT") {
		return "Password is too short.";
	}
	if (data.code === "INVALID_EMAIL") {
		return "Enter a valid email address.";
	}
	return data.message ?? `Authentication failed (${status})`;
}

function SignInPage() {
	const signInMutation = electronTrpc.auth.signIn.useMutation();
	const persistToken = electronTrpc.auth.persistToken.useMutation();
	const navigate = useNavigate();
	const [mode, setMode] = useState<AuthMode>("sign-in");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [emailAuthError, setEmailAuthError] = useState<string | null>(null);
	const { hasLocalToken, isPending, session, sessionRecoveryTimedOut } =
		useSessionRecovery();

	// Dev bypass: skip sign-in entirely
	if (env.SKIP_ENV_VALIDATION) {
		return <Navigate to="/v2-workspaces" replace />;
	}

	// Show loading while session is being fetched
	if (isPending) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<Spinner className="size-8" />
			</div>
		);
	}

	// If already signed in, redirect to workspace
	if (session?.user) {
		return <Navigate to="/v2-workspaces" replace />;
	}

	const signIn = (provider: AuthProvider) => {
		track("auth_started", { provider });
		signInMutation.mutate({ provider });
	};

	const persistSessionToken = async (token: string) => {
		const expiresAt = new Date(
			Date.now() + 1000 * 60 * 60 * 24 * 30,
		).toISOString();
		await persistToken.mutateAsync({ token, expiresAt });
		setAuthToken(token);
		const jwt = await authClient.token().catch(() => null);
		if (jwt?.data?.token) {
			setJwt(jwt.data.token);
		}
	};

	const submitEmailAuth = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (isSubmitting) return;

		const trimmedEmail = email.trim().toLowerCase();
		const trimmedName = name.trim();
		if (mode === "sign-up" && trimmedName.length === 0) {
			setEmailAuthError("Enter your name.");
			return;
		}

		setIsSubmitting(true);
		setEmailAuthError(null);
		track("auth_started", { provider: "email", mode });
		try {
			const result =
				mode === "sign-in"
					? await postEmailAuth("/api/auth/sign-in/email", {
							email: trimmedEmail,
							password,
						})
					: await postEmailAuth("/api/auth/sign-up/email", {
							email: trimmedEmail,
							password,
							name: trimmedName,
						});

			if (!result.ok) {
				throw new Error(getEmailAuthError(result.data, result.status));
			}

			let token = result.data.token ?? null;
			if (!token && mode === "sign-up") {
				const signInResult = await postEmailAuth("/api/auth/sign-in/email", {
					email: trimmedEmail,
					password,
				});
				if (!signInResult.ok) {
					throw new Error(
						getEmailAuthError(signInResult.data, signInResult.status),
					);
				}
				token = signInResult.data.token ?? null;
			}

			if (!token) throw new Error("Authentication did not return a token.");
			await persistSessionToken(token);
			await navigate({ to: "/v2-workspaces", replace: true });
		} catch (error) {
			setEmailAuthError(
				error instanceof Error ? error.message : "Authentication failed.",
			);
			setIsSubmitting(false);
		}
	};

	const isBusy =
		isSubmitting || signInMutation.isPending || persistToken.isPending;

	return (
		<div className="flex flex-col h-full w-full bg-background">
			<div className="h-12 w-full drag shrink-0" />

			<div className="flex flex-1 items-center justify-center">
				<div className="flex flex-col items-center w-full max-w-md px-8">
					<div className="mb-8">
						<SupersetLogo className="h-12 w-auto" />
					</div>

					<div className="text-center mb-8">
						<h1 className="text-xl font-semibold text-foreground mb-2">
							Welcome to Superset
						</h1>
						<p className="text-sm text-muted-foreground">
							{hasLocalToken && !sessionRecoveryTimedOut
								? "Restoring your session"
								: "Sign in or create an account"}
						</p>
					</div>

					<div className="flex flex-col gap-3 w-full max-w-xs">
						<div className="grid grid-cols-2 rounded-md border border-border bg-muted/40 p-1">
							<button
								type="button"
								onClick={() => {
									setMode("sign-in");
									setEmailAuthError(null);
								}}
								className={cn(
									"rounded px-3 py-1.5 text-sm font-medium transition-colors",
									mode === "sign-in"
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								Sign in
							</button>
							<button
								type="button"
								onClick={() => {
									setMode("sign-up");
									setEmailAuthError(null);
								}}
								className={cn(
									"rounded px-3 py-1.5 text-sm font-medium transition-colors",
									mode === "sign-up"
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								Sign up
							</button>
						</div>

						<form className="flex flex-col gap-3" onSubmit={submitEmailAuth}>
							{mode === "sign-up" && (
								<div className="grid gap-1.5">
									<Label htmlFor="name" className="text-xs">
										Name
									</Label>
									<Input
										id="name"
										type="text"
										autoComplete="name"
										value={name}
										onChange={(event) => setName(event.target.value)}
										disabled={isBusy}
										required
									/>
								</div>
							)}
							<div className="grid gap-1.5">
								<Label htmlFor="email" className="text-xs">
									Email
								</Label>
								<Input
									id="email"
									type="email"
									autoComplete="email"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									disabled={isBusy}
									required
								/>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor="password" className="text-xs">
									Password
								</Label>
								<Input
									id="password"
									type="password"
									autoComplete={
										mode === "sign-in" ? "current-password" : "new-password"
									}
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									disabled={isBusy}
									required
								/>
							</div>
							{emailAuthError && (
								<p className="text-xs text-destructive text-center select-text cursor-text">
									{emailAuthError}
								</p>
							)}
							<Button
								type="submit"
								size="lg"
								className="w-full"
								disabled={isBusy}
							>
								{isSubmitting
									? mode === "sign-in"
										? "Signing in..."
										: "Creating account..."
									: mode === "sign-in"
										? "Sign in"
										: "Create account"}
							</Button>
						</form>

						<div className="relative py-1">
							<div className="absolute inset-0 flex items-center">
								<div className="w-full border-t border-border" />
							</div>
							<div className="relative flex justify-center">
								<span className="bg-background px-2 text-xs text-muted-foreground">
									or
								</span>
							</div>
						</div>

						{signInMutation.error && (
							<p className="text-xs text-destructive text-center select-text cursor-text">
								{signInMutation.error.message}
							</p>
						)}
						<Button
							variant="outline"
							size="lg"
							onClick={() => signIn("github")}
							className="w-full gap-3"
							disabled={isBusy}
						>
							<FaGithub className="size-5" />
							Continue with GitHub
						</Button>

						<Button
							variant="outline"
							size="lg"
							onClick={() => signIn("google")}
							className="w-full gap-3"
							disabled={isBusy}
						>
							<FcGoogle className="size-5" />
							Continue with Google
						</Button>
					</div>

					<p className="mt-8 text-xs text-muted-foreground/70 text-center max-w-xs">
						By signing in, you agree to our{" "}
						<a
							href={COMPANY.TERMS_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-muted-foreground transition-colors"
						>
							Terms of Service
						</a>{" "}
						and{" "}
						<a
							href={COMPANY.PRIVACY_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-muted-foreground transition-colors"
						>
							Privacy Policy
						</a>
					</p>
				</div>
			</div>
		</div>
	);
}
