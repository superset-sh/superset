import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { signIn, signUp } from "@/lib/auth/client";

const DEV_EMAIL = "admin@local.test";
const DEV_PASSWORD = "supersetdev";
const DEV_NAME = "Local Admin";

export function DevSignInButton() {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSignIn = async () => {
		setIsLoading(true);
		setError(null);

		try {
			let res = await signIn.email({
				email: DEV_EMAIL,
				password: DEV_PASSWORD,
			});

			if (res.error) {
				// Account doesn't exist, create it
				const signUpRes = await signUp.email({
					email: DEV_EMAIL,
					password: DEV_PASSWORD,
					name: DEV_NAME,
				});

				if (signUpRes.error) {
					throw new Error(signUpRes.error.message);
				}

				// Retry sign-in after account creation
				res = await signIn.email({
					email: DEV_EMAIL,
					password: DEV_PASSWORD,
				});
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

	return (
		<View className="w-full items-center gap-2">
			<Button
				onPress={handleSignIn}
				disabled={isLoading}
				variant="outline"
				size="lg"
				className="w-4/5"
			>
				<Text>
					{isLoading ? "Signing in..." : "Sign in as Local Admin (dev)"}
				</Text>
			</Button>
			{error && (
				<Text className="text-center text-sm text-destructive">{error}</Text>
			)}
		</View>
	);
}
