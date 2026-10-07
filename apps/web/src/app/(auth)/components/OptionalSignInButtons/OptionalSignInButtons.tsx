"use client";
import { Trans, useLingui } from "@lingui/react/macro";
import { authClient } from "@superset/auth/client";
import { optionalAuthProviders } from "@superset/shared/optional-auth-providers";
import { Button } from "@superset/ui/button";
import { env } from "@/env";

export function OptionalSignInButtons({
	callbackURL,
	disabled,
	onPending,
	onError,
}: {
	callbackURL: string;
	disabled: boolean;
	onPending: (value: boolean) => void;
	onError: (error: string | null) => void;
}) {
	const { t } = useLingui();
	async function signIn(provider: "gitlab") {
		onPending(true);
		onError(null);
		try {
			const result = await authClient.signIn.social({ provider, callbackURL });
			if (result.error) throw new Error(result.error.message);
		} catch {
			onError(t({ message: "Failed to sign in. Please try again." }));
			onPending(false);
		}
	}
	return optionalAuthProviders(env.NEXT_PUBLIC_AUTH_PROVIDERS).map(
		(provider) => (
			<Button
				key={provider}
				variant="outline"
				disabled={disabled}
				onClick={() => signIn(provider)}
				className="w-full"
			>
				<Trans>Continue with GitLab</Trans>
			</Button>
		),
	);
}
