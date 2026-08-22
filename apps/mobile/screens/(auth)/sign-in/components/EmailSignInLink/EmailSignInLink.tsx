import { prompt } from "@superset/alert-prompt";
import { useState } from "react";
import { Text } from "@/components/ui/text";
import { signIn } from "@/lib/auth/client";

/** Quiet credential sign-in for accounts with a password set (App Store
 * review demo account; sign-up stays disabled in production). */
export function EmailSignInLink({
	onError,
}: {
	onError: (message: string) => void;
}) {
	const [isLoading, setIsLoading] = useState(false);

	const handlePress = async () => {
		const email = (
			await prompt({
				title: "Sign in with email",
				message: "Email",
				confirmText: "Next",
			})
		)?.trim();
		if (!email) return;

		const password = await prompt({
			title: "Sign in with email",
			message: `Password for ${email}`,
			confirmText: "Sign in",
		});
		if (!password) return;

		setIsLoading(true);
		try {
			const res = await signIn.email({ email, password });
			if (res.error) throw new Error(res.error.message);
		} catch (err) {
			console.error("[sign-in] Email error:", err);
			onError(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Text
			className="text-sm text-muted-foreground underline"
			onPress={isLoading ? undefined : () => void handlePress()}
		>
			Sign in with email
		</Text>
	);
}
