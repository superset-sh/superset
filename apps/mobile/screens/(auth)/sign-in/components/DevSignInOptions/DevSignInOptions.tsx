import { useLingui } from "@lingui/react/macro";
import { prompt } from "@superset/alert-prompt";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { authClient, signIn, signUp } from "@/lib/auth/client";
import { env } from "@/lib/env";
import { errorCopy } from "@/lib/errors";

const DEV_EMAIL = "admin@local.test";
const DEV_PASSWORD = "supersetdev";
const DEV_NAME = "Local Admin";

/**
 * Dev-only sign-in helpers: an auto sign-in for a real local/sandbox setup
 * (below), a one-tap seeded local-admin button (fallback when there's
 * nothing to auto sign in with), and an email+password prompt for signing in
 * as any account — set a password on a real account via the admin
 * dashboard's "Set Password" action to use it here.
 */
export function DevSignInOptions() {
	const { t } = useLingui();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const autoSignInAttempted = useRef(false);

	const signInWithEmail = async (email: string, password: string) => {
		setIsLoading(true);
		setError(null);

		try {
			let res = await signIn.email({ email, password });

			// The seeded local admin is created on first use; real accounts are not.
			if (res.error && email === DEV_EMAIL) {
				const signUpRes = await signUp.email({
					email,
					password,
					name: DEV_NAME,
				});
				if (signUpRes.error) {
					throw new Error(signUpRes.error.message);
				}
				res = await signIn.email({ email, password });
			}

			if (res.error) {
				throw new Error(res.error.message);
			}
		} catch (err) {
			console.error("[dev-sign-in] Error:", err);
			setError(errorCopy(err));
		} finally {
			setIsLoading(false);
		}
	};

	// .superset/setup.sh (local) or setup.cloud.sh (cloud sandbox) mints a
	// one-time token redeemable for the real developer's/creator's own session
	// (seed-local-mobile-token.ts, seed-cloud-mobile-token.ts) and bakes it
	// into this build's env. Redeem it the moment this screen appears —
	// nobody has to know this screen exists. authClient's expo plugin stores
	// the resulting session the same way it would after any other sign-in, so
	// there's nothing setup-specific past this call.
	useEffect(() => {
		const token = env.EXPO_PUBLIC_DEV_ONE_TIME_TOKEN;
		if (!token || autoSignInAttempted.current) return;
		autoSignInAttempted.current = true;
		setIsLoading(true);
		authClient.oneTimeToken
			.verify({ token })
			.catch((err) => {
				console.error("[dev-sign-in] Auto sign-in error:", err);
				setError(errorCopy(err));
			})
			.finally(() => setIsLoading(false));
	}, []);

	const handlePromptSignIn = async () => {
		const email = (
			await prompt({
				title: t({ message: "Dev sign in" }),
				message: t({ message: "Email" }),
				defaultValue: DEV_EMAIL,
				confirmText: t({ message: "Next" }),
				selectText: true,
			})
		)?.trim();
		if (!email) return;

		const password = await prompt({
			title: t({ message: "Dev sign in" }),
			message: t({
				message: `Password for ${email}`,
			}),
			defaultValue: DEV_PASSWORD,
			confirmText: t({ message: "Sign in" }),
			selectText: true,
		});
		if (!password) return;

		await signInWithEmail(email, password);
	};

	return (
		<View className="w-full items-center gap-2">
			<Button
				testID="dev-sign-in-button"
				onPress={() => void signInWithEmail(DEV_EMAIL, DEV_PASSWORD)}
				disabled={isLoading}
				variant="outline"
				size="lg"
				className="w-4/5 max-w-sm"
			>
				<Text>
					{isLoading
						? t({ message: "Signing in..." })
						: t({ message: "Sign in as Local Admin (dev)" })}
				</Text>
			</Button>
			<Button
				onPress={() => void handlePromptSignIn()}
				disabled={isLoading}
				variant="outline"
				size="lg"
				className="w-4/5 max-w-sm"
			>
				<Text>
					{isLoading
						? t({ message: "Signing in..." })
						: t({ message: "Sign in with email (dev)" })}
				</Text>
			</Button>
			{error && (
				<Text className="text-center text-sm text-destructive">{error}</Text>
			)}
		</View>
	);
}
