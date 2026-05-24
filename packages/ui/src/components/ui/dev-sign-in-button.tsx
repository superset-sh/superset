import { useState } from "react";

import { Button } from "./button";

export interface DevSignInButtonProps {
	/**
	 * Performs the platform-specific dev sign-in (and any redirect on success).
	 * Throwing rejects with an error message rendered under the button.
	 */
	onSignIn: () => Promise<void>;
}

/**
 * One-click sign-in button for local-dev profiles. Pure UI; the calling app
 * supplies the auth transport and post-sign-in routing via onSignIn.
 *
 * Dev-only — render only when NODE_ENV !== "production" (or the platform's
 * equivalent local-profile gate).
 */
export function DevSignInButton({ onSignIn }: DevSignInButtonProps) {
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleClick = async () => {
		setSubmitting(true);
		setError(null);
		try {
			await onSignIn();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Dev sign-in failed");
			setSubmitting(false);
		}
	};

	return (
		<div className="grid gap-2">
			<Button
				type="button"
				variant="outline"
				disabled={submitting}
				onClick={handleClick}
				className="w-full"
			>
				{submitting ? "Signing in..." : "Sign in as Local Admin (dev)"}
			</Button>
			{error && <p className="text-destructive text-center text-xs">{error}</p>}
		</div>
	);
}
