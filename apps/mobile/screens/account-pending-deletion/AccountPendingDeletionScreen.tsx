import Ionicons from "@expo/vector-icons/Ionicons";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { useState } from "react";
import { Alert, Linking, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useSignOut } from "@/hooks/useSignOut";
import { useTheme } from "@/hooks/useTheme";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";
import { useDaysUntilPurge } from "./hooks/useDaysUntilPurge";

export function AccountPendingDeletionScreen() {
	const { t } = useLingui();
	const theme = useTheme();
	const { data: session, refetch } = useSession();
	const { signOut, isSigningOut } = useSignOut();
	const [isReactivating, setIsReactivating] = useState(false);

	const daysRemaining = useDaysUntilPurge(
		session?.user.deletionRequestedAt ?? null,
	);

	const handleReactivate = async () => {
		setIsReactivating(true);
		try {
			await apiClient.user.reactivateAccount.mutate();
			await refetch();
		} catch (error) {
			console.error("[account/reactivate] Failed:", error);
			Alert.alert(
				t({
					message: "Could not reactivate",
				}),
				error instanceof Error
					? error.message
					: t({
							message: "Something went wrong.",
						}),
			);
		} finally {
			setIsReactivating(false);
		}
	};

	return (
		<View className="flex-1 items-center justify-center gap-6 bg-background p-6">
			<View
				className="size-16 items-center justify-center rounded-full"
				style={{ backgroundColor: theme.muted }}
			>
				<Ionicons name="alert-circle" size={40} color={theme.destructive} />
			</View>

			<View className="items-center gap-2">
				<Text className="text-2xl font-semibold text-foreground">
					<Trans>Account pending deletion</Trans>
				</Text>
				<Text className="text-center text-base text-muted-foreground">
					{daysRemaining !== null && daysRemaining > 0 ? (
						<Plural
							value={daysRemaining}
							one="Your account is deactivated and will be permanently deleted in # day. Reactivate to restore it exactly as you left it."
							other="Your account is deactivated and will be permanently deleted in # days. Reactivate to restore it exactly as you left it."
						/>
					) : (
						<Trans>
							Your account is deactivated and will be permanently deleted soon.
							Reactivate to restore it exactly as you left it.
						</Trans>
					)}
				</Text>
			</View>

			<View className="w-full items-center gap-3">
				<Button
					size="lg"
					className="w-4/5"
					onPress={isReactivating ? undefined : handleReactivate}
				>
					<Text>
						{isReactivating
							? t({
									message: "Reactivating…",
								})
							: t({
									message: "Reactivate my account",
								})}
					</Text>
				</Button>
				<Button
					variant="outline"
					size="lg"
					className="w-4/5"
					onPress={() => Linking.openURL(COMPANY.MAIL_TO)}
				>
					<Text>
						<Trans>Contact support</Trans>
					</Text>
				</Button>
				<Button
					variant="ghost"
					size="lg"
					className="w-4/5"
					onPress={isSigningOut ? undefined : () => void signOut()}
				>
					<Text>
						<Trans>Log out</Trans>
					</Text>
				</Button>
			</View>
		</View>
	);
}
