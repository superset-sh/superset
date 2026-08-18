import { prompt } from "@superset/alert-prompt";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { signIn, signUp } from "@/lib/auth/client";

const DEV_EMAIL = "admin@local.test";
const DEV_PASSWORD = "supersetdev";
const DEV_NAME = "Local Admin";

/**
 * Dev-only sign-in helpers: a one-tap seeded local-admin button (Maestro
 * flows depend on it) plus an email+password prompt for signing in as any
 * account — set a password on a real account via the admin dashboard's
 * "Set Password" action to use it here.
 */
export function DevSignInOptions() {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
			const message =
				err instanceof Error ? err.message : "Something went wrong";
			console.error("[dev-sign-in] Error:", err);
			setError(message);
		} finally {
			setIsLoading(false);
		}
	};

	const handlePromptSignIn = async () => {
		const email = (
			await prompt({
				title: "Dev sign in",
				message: "Email",
				defaultValue: DEV_EMAIL,
				confirmText: "Next",
				selectText: true,
			})
		)?.trim();
		if (!email) return;

		const password = await prompt({
			title: "Dev sign in",
			message: `Password for ${email}`,
			defaultValue: DEV_PASSWORD,
			confirmText: "Sign in",
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
				className="w-4/5"
			>
				<Text>
					{isLoading ? "Signing in..." : "Sign in as Local Admin (dev)"}
				</Text>
			</Button>
			<Button
				onPress={() => void handlePromptSignIn()}
				disabled={isLoading}
				variant="outline"
				size="lg"
				className="w-4/5"
			>
				<Text>Sign in with email (dev)</Text>
			</Button>
			{error && (
				<Text className="text-center text-sm text-destructive">{error}</Text>
			)}
		</View>
	);
}
