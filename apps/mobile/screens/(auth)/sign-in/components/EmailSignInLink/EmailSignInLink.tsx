import { Trans, useLingui } from "@lingui/react/macro";
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
	const { t } = useLingui();
	const [isLoading, setIsLoading] = useState(false);

	const handlePress = async () => {
		const email = (
			await prompt({
				title: t({
					message: "Sign in with email",
				}),
				message: t({ message: "Email" }),
				confirmText: t({ message: "Next" }),
			})
		)?.trim();
		if (!email) return;

		const password = await prompt({
			title: t({
				message: "Sign in with email",
			}),
			message: t({
				message: `Password for ${email}`,
			}),
			confirmText: t({ message: "Sign in" }),
		});
		if (!password) return;

		setIsLoading(true);
		try {
			const res = await signIn.email({ email, password });
			if (res.error) throw new Error(res.error.message);
		} catch (err) {
			console.error("[sign-in] Email error:", err);
			onError(
				err instanceof Error
					? err.message
					: t({
							message: "Something went wrong",
						}),
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Text
			className="text-sm text-muted-foreground underline"
			onPress={isLoading ? undefined : () => void handlePress()}
		>
			<Trans>Sign in with email</Trans>
		</Text>
	);
}
