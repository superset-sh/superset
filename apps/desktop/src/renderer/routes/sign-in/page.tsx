import { Trans } from "@lingui/react/macro";
import { type AuthProvider, COMPANY } from "@superset/shared/constants";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { Redirect } from "renderer/components/Redirect";
import { env } from "renderer/env.renderer";
import { useDelayElapsed } from "renderer/hooks/useDelayElapsed";
import { track } from "renderer/lib/analytics";
import { setAuthToken, useSessionStatus } from "renderer/lib/auth-client";
import { requestDevSignIn } from "renderer/lib/dev-sign-in";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type AuthMethod,
	readLastAuthMethod,
	writeLastAuthMethod,
} from "renderer/lib/last-auth-method";
import { SupersetLogo } from "./components/SupersetLogo";
import { useSessionRecovery } from "./hooks/useSessionRecovery";

export const Route = createFileRoute("/sign-in/")({
	component: SignInPage,
});

const workspaceRedirect = <Redirect to="/workspace" replace />;

const SESSION_PENDING_TIMEOUT_MS = 15_000;

function SignInPage() {
	const signInMutation = electronTrpc.auth.signIn.useMutation();
	const persistToken = electronTrpc.auth.persistToken.useMutation();
	const navigate = useNavigate();
	const router = useRouter();
	const [isLoadingDev, setIsLoadingDev] = useState(false);
	const [devError, setDevError] = useState<string | null>(null);
	const [lastUsedMethod, setLastUsedMethod] = useState(readLastAuthMethod);
	const { hasLocalToken, isPending, session } = useSessionRecovery();
	// The session on screen is the last known identity, not a sign-in: the
	// person came here from "Sign in again" and needs the buttons.
	const isSessionEnded = useSessionStatus() === "ended";
	// A session fetch that never settles must not trap the user on a spinner —
	// fall through to the sign-in buttons after a while (#5729).
	const pendingTimedOut = useDelayElapsed(
		isPending,
		SESSION_PENDING_TIMEOUT_MS,
	);

	// Dev bypass: skip sign-in entirely
	if (env.SKIP_ENV_VALIDATION) {
		return workspaceRedirect;
	}

	// Show loading while session is being fetched
	if (isPending && !pendingTimedOut) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<Spinner className="size-8" />
			</div>
		);
	}

	// If already signed in, redirect to workspace
	if (session?.user && !isSessionEnded) {
		return workspaceRedirect;
	}

	const rememberLastUsedMethod = (method: AuthMethod) => {
		writeLastAuthMethod(method);
		setLastUsedMethod(method);
	};

	const signIn = (provider: AuthProvider) => {
		track("auth_started", { provider });
		rememberLastUsedMethod(provider);
		signInMutation.mutate({ provider });
	};

	const signInAsDev = async () => {
		setIsLoadingDev(true);
		setDevError(null);
		rememberLastUsedMethod("dev");

		try {
			const { token, expiresAt } = await requestDevSignIn();
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

	const lastUsedBadge = (
		<Badge variant="secondary">
			<Trans>Last used</Trans>
		</Badge>
	);

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
							<Trans>Welcome to Superset</Trans>
						</h1>
						<p className="text-sm text-muted-foreground">
							{hasLocalToken && !isSessionEnded ? (
								<Trans>Restoring your session</Trans>
							) : (
								<Trans>Sign in to get started</Trans>
							)}
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
								{lastUsedMethod === "dev" && lastUsedBadge}
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
							<Trans>Continue with GitHub</Trans>
							{lastUsedMethod === "github" && lastUsedBadge}
						</Button>

						<Button
							variant="outline"
							size="lg"
							onClick={() => signIn("google")}
							className="w-full gap-3"
							disabled={signInMutation.isPending}
						>
							<FcGoogle className="size-5" />
							<Trans>Continue with Google</Trans>
							{lastUsedMethod === "google" && lastUsedBadge}
						</Button>
					</div>

					{isSessionEnded && (
						<Button
							variant="ghost"
							size="sm"
							className="mt-4"
							onClick={() => router.history.back()}
						>
							<Trans>Back</Trans>
						</Button>
					)}

					<p className="mt-8 text-xs text-muted-foreground/70 text-center max-w-xs">
						<Trans>
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
						</Trans>
					</p>
				</div>
			</div>
		</div>
	);
}
