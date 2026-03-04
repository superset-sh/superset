import { useState } from "react";
import { Image, Linking, View } from "react-native";
import { Text } from "@/components/ui/text";
import { signIn } from "@/lib/auth/client";

import type { SocialProvider } from "./components/SocialButton";
import { SocialButton } from "./components/SocialButton";

const TERMS_URL = "https://superset.sh/terms";
const PRIVACY_URL = "https://superset.sh/privacy";

export function SignInScreen() {
	const [error, setError] = useState<string | null>(null);

	const handleSignIn = async (provider: SocialProvider) => {
		setError(null);
		try {
			await signIn.social({
				provider,
				callbackURL: "/",
			});
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Something went wrong";
			console.error("[sign-in] Error:", err);
			setError(message);
		}
	};

	return (
		<View className="flex-1 items-center justify-center gap-8 bg-background p-6">
			<Image
				source={require("@/assets/icon.png")}
				style={{ width: 80, height: 80, borderRadius: 16 }}
			/>

			<View className="items-center gap-2">
				<Text className="text-2xl font-semibold text-foreground">
					Welcome to Superset
				</Text>
				<Text className="text-base text-muted-foreground">
					Sign in to get started
				</Text>
			</View>

			<View className="w-full items-center gap-3">
				<SocialButton
					provider="github"
					onPress={() => handleSignIn("github")}
					className="w-4/5"
				/>
				<SocialButton
					provider="google"
					onPress={() => handleSignIn("google")}
					className="w-4/5"
				/>
			</View>

			{error && (
				<Text className="text-center text-sm text-destructive">{error}</Text>
			)}

			<Text className="text-center text-xs text-muted-foreground/70">
				By signing in, you agree to our{"\n"}
				<Text
					className="text-xs text-muted-foreground underline"
					onPress={() => Linking.openURL(TERMS_URL)}
				>
					Terms of Service
				</Text>{" "}
				and{" "}
				<Text
					className="text-xs text-muted-foreground underline"
					onPress={() => Linking.openURL(PRIVACY_URL)}
				>
					Privacy Policy
				</Text>
			</Text>
		</View>
	);
}
