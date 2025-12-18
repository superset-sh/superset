"use client";

import { useSignIn } from "@clerk/nextjs";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const PROVIDER_STRATEGIES: Record<string, "oauth_google" | "oauth_github"> = {
	google: "oauth_google",
	github: "oauth_github",
};

export default function DesktopOAuthPage() {
	const { signIn, isLoaded } = useSignIn();
	const params = useParams();
	const searchParams = useSearchParams();
	const [error, setError] = useState<string | null>(null);

	const provider = params.provider as string;
	const codeChallenge = searchParams.get("code_challenge");
	const state = searchParams.get("state");

	useEffect(() => {
		if (!isLoaded || !signIn) return;

		const strategy = PROVIDER_STRATEGIES[provider];
		if (!strategy) {
			setError(`Invalid provider: ${provider}`);
			return;
		}

		if (!codeChallenge || !state) {
			setError("Missing required parameters");
			return;
		}

		// Build callback URL for after OAuth completes
		const callbackUrl = new URL(
			"/api/auth/desktop/callback",
			window.location.origin,
		);
		callbackUrl.searchParams.set("code_challenge", codeChallenge);
		callbackUrl.searchParams.set("state", state);

		// Trigger OAuth
		signIn.authenticateWithRedirect({
			strategy,
			redirectUrl: "/sso-callback",
			redirectUrlComplete: callbackUrl.toString(),
		});
	}, [isLoaded, signIn, provider, codeChallenge, state]);

	if (error) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="text-center">
					<h1 className="text-xl font-semibold text-red-600">Error</h1>
					<p className="text-muted-foreground mt-2">{error}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="text-center">
				<p className="text-muted-foreground">Redirecting to {provider}...</p>
			</div>
		</div>
	);
}
