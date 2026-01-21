import { useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { signIn } from "@/lib/auth/client";

export default function SignInScreen() {
	const [loading, setLoading] = useState<"github" | "google" | null>(null);

	const handleSignIn = async (provider: "github" | "google") => {
		console.log("[sign-in] Button clicked:", provider);
		try {
			setLoading(provider);
			console.log("[sign-in] Calling signIn.social...");
			const result = await signIn.social({
				provider,
				callbackURL: "/",
			});
			console.log("[sign-in] signIn.social result:", result);
		} catch (error) {
			console.error("[sign-in] Error caught:", error);
			console.error("[sign-in] Error details:", JSON.stringify(error, null, 2));
			Alert.alert(
				"Sign In Failed",
				error instanceof Error ? error.message : JSON.stringify(error),
			);
		} finally {
			setLoading(null);
		}
	};

	return (
		<View className="flex-1 items-center justify-center bg-background p-6">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="text-2xl">Welcome to Superset</CardTitle>
					<CardDescription>Sign in to continue</CardDescription>
				</CardHeader>
				<CardContent className="gap-4">
					<Button
						onPress={() => handleSignIn("github")}
						disabled={loading !== null}
						className="w-full"
					>
						{loading === "github" ? (
							<ActivityIndicator size="small" color="white" />
						) : (
							<Text className="text-primary-foreground">
								Continue with GitHub
							</Text>
						)}
					</Button>

					<Button
						variant="secondary"
						onPress={() => handleSignIn("google")}
						disabled={loading !== null}
						className="w-full"
					>
						{loading === "google" ? (
							<ActivityIndicator size="small" />
						) : (
							<Text className="text-secondary-foreground">
								Continue with Google
							</Text>
						)}
					</Button>
				</CardContent>
			</Card>
		</View>
	);
}
