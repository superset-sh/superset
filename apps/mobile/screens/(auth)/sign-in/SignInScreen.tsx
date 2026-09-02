import { Trans, useLingui } from "@lingui/react/macro";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { useState } from "react";
import { Image, View } from "react-native";

import { Text } from "@/components/ui/text";
import { signIn } from "@/lib/auth/client";
import { env } from "@/lib/env";
import { openUrl } from "@/lib/open-url";

import { DevSignInOptions } from "./components/DevSignInOptions";
import { EmailSignInLink } from "./components/EmailSignInLink";
import type { SocialProvider } from "./components/SocialButton";
import { SocialButton } from "./components/SocialButton";

const TERMS_URL = "https://superset.sh/terms";
const PRIVACY_URL = "https://superset.sh/privacy";

export function SignInScreen() {
	const { t } = useLingui();
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
				err instanceof Error
					? err.message
					: t({
							message: "Something went wrong",
						});
			console.error("[sign-in] Error:", err);
			setError(message);
		}
	};

	const handleAppleSignIn = async () => {
		setError(null);
		try {
			// Apple puts SHA256(nonce) in the identity token; the server gets the
			// raw nonce and better-auth compares against the hashed claim.
			const rawNonce = Crypto.randomUUID();
			const hashedNonce = await Crypto.digestStringAsync(
				Crypto.CryptoDigestAlgorithm.SHA256,
				rawNonce,
			);
			const credential = await AppleAuthentication.signInAsync({
				requestedScopes: [
					AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
					AppleAuthentication.AppleAuthenticationScope.EMAIL,
				],
				nonce: hashedNonce,
			});
			if (!credential.identityToken) {
				throw new Error("Apple did not return an identity token");
			}
			await signIn.social({
				provider: "apple",
				idToken: {
					token: credential.identityToken,
					nonce: rawNonce,
					// Apple only sends name/email on the very first authorization
					user: {
						name: {
							firstName: credential.fullName?.givenName ?? undefined,
							lastName: credential.fullName?.familyName ?? undefined,
						},
						email: credential.email ?? undefined,
					},
				},
				callbackURL: "/",
			});
		} catch (err) {
			if (
				err instanceof Error &&
				"code" in err &&
				err.code === "ERR_REQUEST_CANCELED"
			) {
				return;
			}
			const message =
				err instanceof Error
					? err.message
					: t({
							message: "Something went wrong",
						});
			console.error("[sign-in] Apple error:", err);
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
					<Trans>Welcome to Superset</Trans>
				</Text>
				<Text className="text-base text-muted-foreground">
					<Trans>Sign in to get started</Trans>
				</Text>
			</View>

			<View className="w-full items-center gap-3">
				<SocialButton
					provider="apple"
					onPress={handleAppleSignIn}
					className="w-4/5"
				/>
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
				{(__DEV__ || env.EXPO_PUBLIC_E2E === "1") && <DevSignInOptions />}
				<EmailSignInLink onError={setError} />
			</View>

			{error && (
				<Text className="text-center text-sm text-destructive">{error}</Text>
			)}

			<Text className="text-center text-xs text-muted-foreground/70">
				<Trans>
					By signing in, you agree to our{"\n"}
					<Text
						className="text-xs text-muted-foreground underline"
						onPress={() => openUrl(TERMS_URL)}
					>
						Terms of Service
					</Text>{" "}
					and{" "}
					<Text
						className="text-xs text-muted-foreground underline"
						onPress={() => openUrl(PRIVACY_URL)}
					>
						Privacy Policy
					</Text>
				</Trans>
			</Text>
		</View>
	);
}
