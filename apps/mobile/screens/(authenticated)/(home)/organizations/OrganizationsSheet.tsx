import Ionicons from "@expo/vector-icons/Ionicons";
import { Trans, useLingui } from "@lingui/react/macro";
import { Stack, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useSignOut } from "@/hooks/useSignOut";
import { useTheme } from "@/hooks/useTheme";
import { useSession } from "@/lib/auth/client";
import { OrganizationAvatar } from "@/screens/(authenticated)/components/OrganizationAvatar";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";

/** Which organization the app is in, plus the two account-level ways out. */
export function OrganizationsSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const theme = useTheme();
	const { signOut, isSigningOut } = useSignOut();
	// The session carries the active org's plan, so the paywall gate only
	// re-evaluates once it is refetched.
	const { refetch } = useSession();
	const { organizations, activeOrganizationId, switchOrganization } =
		useOrganizations();

	return (
		<>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					icon="xmark"
					accessibilityLabel={t({
						message: "Close",
					})}
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			<ScrollView
				className="bg-background flex-1"
				contentContainerClassName="px-5 pb-10"
				contentInsetAdjustmentBehavior="automatic"
			>
				{organizations.map((organization) => (
					<Pressable
						key={organization.id}
						accessibilityLabel={organization.name}
						onPress={() => {
							router.back();
							void switchOrganization(organization.id).then(() => refetch());
						}}
						className="flex-row items-center gap-2.5 py-2.5 active:opacity-60"
					>
						<OrganizationAvatar
							name={organization.name}
							logo={organization.logo}
							size={32}
						/>
						<View className="flex-1">
							<Text className="text-sm font-medium">{organization.name}</Text>
							{organization.slug ? (
								<Text className="text-muted-foreground text-xs">
									{organization.slug}
								</Text>
							) : null}
						</View>
						{organization.id === activeOrganizationId ? (
							<Ionicons
								name="checkmark-circle"
								size={18}
								color={theme.primary}
							/>
						) : null}
					</Pressable>
				))}

				<View className="bg-border my-3 h-px" />

				<Pressable
					accessibilityLabel={t({
						message: "Settings",
					})}
					onPress={() => {
						router.back();
						router.push("/(authenticated)/settings");
					}}
					className="flex-row items-center gap-2.5 py-2.5 active:opacity-60"
				>
					<Ionicons
						name="settings-outline"
						size={28}
						color={theme.mutedForeground}
					/>
					<Text className="text-sm font-medium">
						<Trans>Settings</Trans>
					</Text>
				</Pressable>
				<Pressable
					accessibilityLabel={t({
						message: "Log out",
					})}
					onPress={() => {
						router.back();
						void signOut();
					}}
					disabled={isSigningOut}
					className="flex-row items-center gap-2.5 py-2.5 active:opacity-60"
				>
					<Ionicons
						name="log-out-outline"
						size={28}
						color={theme.destructive}
					/>
					<Text className="text-destructive text-sm font-medium">
						<Trans>Log out</Trans>
					</Text>
				</Pressable>
			</ScrollView>
		</>
	);
}
