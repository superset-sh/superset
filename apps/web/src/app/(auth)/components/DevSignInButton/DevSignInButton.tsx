"use client";

import { authClient } from "@superset/auth/client";
import { Button } from "@superset/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

const DEV_EMAIL = "admin@local.test";
const DEV_PASSWORD = "supersetdev";
const DEV_NAME = "Local Admin";

interface DevSignInButtonProps {
	callbackURL: string;
}

export function DevSignInButton({ callbackURL }: DevSignInButtonProps) {
	const router = useRouter();
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onClick = async () => {
		setSubmitting(true);
		setError(null);

		try {
			let res = await authClient.signIn.email({
				email: DEV_EMAIL,
				password: DEV_PASSWORD,
			});
			if (res.error) {
				const signUpRes = await authClient.signUp.email({
					email: DEV_EMAIL,
					password: DEV_PASSWORD,
					name: DEV_NAME,
				});
				if (signUpRes.error) throw new Error(signUpRes.error.message);
				res = await authClient.signIn.email({
					email: DEV_EMAIL,
					password: DEV_PASSWORD,
				});
			}
			if (res.error) throw new Error(res.error.message);
			router.push(callbackURL);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Dev sign-in failed";
			setError(message);
			setSubmitting(false);
		}
	};

	return (
		<div className="grid gap-2">
			<Button
				type="button"
				variant="outline"
				disabled={submitting}
				onClick={onClick}
				className="w-full"
			>
				{submitting ? "Signing in..." : "Sign in as Local Admin (dev)"}
			</Button>
			{error && <p className="text-destructive text-center text-xs">{error}</p>}
		</div>
	);
}
