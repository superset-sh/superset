import { type AuthProvider, COMPANY } from "@superset/shared/constants";
import {
	DEV_EMAIL,
	DEV_NAME,
	DEV_PASSWORD,
} from "@superset/shared/dev-credentials";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { env } from "renderer/env.renderer";
import { track } from "renderer/lib/analytics";
import { setAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { SupersetLogo } from "./components/SupersetLogo";
import { useSessionRecovery } from "./hooks/useSessionRecovery";

export const Route = createFileRoute("/sign-in/")({
	component: SignInPage,
});

function SignInPage() {
	const signInMutation = electronTrpc.auth.signIn.useMutation();
	const persistToken = electronTrpc.auth.persistToken.useMutation();
	const navigate = useNavigate();
	const [isLoadingDev, setIsLoadingDev] = useState(false);
	const [devError, setDevError] = useState<string | null>(null);
	const { hasLocalToken, isPending, session } = useSessionRecovery();

	// Dev bypass: skip sign-in entirely
	if (env.SKIP_ENV_VALIDATION) {
		return <Navigate to="/workspace" replace />;
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
		return <Navigate to="/workspace" replace />;
	}

	const signIn = (provider: AuthProvider) => {
		track("auth_started", { provider });
		signInMutation.mutate({ provider });
	};

	const signInAsDev = async () => {
		setIsLoadingDev(true);
		setDevError(null);

		const postAuth = async (path: string, body: Record<string, unknown>) => {
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
		};

		try {
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
				throw new Error(
					result.data.message ?? `Sign-in failed (${result.status})`,
				);
			}
			const token = result.data.token;
			if (!token) throw new Error("Sign-in did not return a token");
			const expiresAt = new Date(
				Date.now() + 1000 * 60 * 60 * 24 * 30,
			).toISOString();
			await persistToken.mutateAsync({ token, expiresAt });
			setAuthToken(token);
			await navigate({ to: "/workspace", replace: true });
		} catch (error) {
			setDevError(
				error instanceof Error ? error.message : "Dev sign-in failed",
			);
			setIsLoadingDev(false);
		}
	};

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
							{hasLocalToken
								? "Restoring your session"
								: "Sign in to get started"}
						</p>
					</div>

					<div className="flex flex-col gap-3 w-full max-w-xs">
						{env.NODE_ENV === "development" && (
							<Button
								variant="outline"
								size="lg"
								onClick={signInAsDev}
								className="w-full gap-3"
								disabled={isLoadingDev}
							>
								{isLoadingDev
									? "Signing in..."
									: "Sign in as Local Admin (dev)"}
							</Button>
						)}
						{devError && (
							<p className="text-xs text-destructive text-center select-text cursor-text">
								{devError}
							</p>
						)}
						<Button
							variant="outline"
							size="lg"
							onClick={() => signIn("github")}
							className="w-full gap-3"
							disabled={signInMutation.isPending}
						>
							<FaGithub className="size-5" />
							Continue with GitHub
						</Button>

						<Button
							variant="outline"
							size="lg"
							onClick={() => signIn("google")}
							className="w-full gap-3"
							disabled={signInMutation.isPending}
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
