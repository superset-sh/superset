import Ionicons from "@expo/vector-icons/Ionicons";
import { Trans, useLingui } from "@lingui/react/macro";
import { Stack, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useSignOut } from "@/hooks/useSignOut";
import { useTheme } from "@/hooks/useTheme";
import { OrganizationAvatar } from "@/screens/(authenticated)/components/OrganizationAvatar";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";

/**
 * The organization's home: everything that belongs to the org rather than to
 * one workspace. Pages lives here beside switching and settings — it is not a
 * step in the workspace flow the home list is built around, and Tasks and
 * Automations will want the same shelf.
 */
export function OrganizationsSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const theme = useTheme();
	const { signOut, isSigningOut } = useSignOut();
	const { activeOrganization } = useOrganizations();

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
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t({
						message: "Switch organization",
					})}
					onPress={() =>
						router.push("/(authenticated)/(home)/organizations/switch")
					}
					className="flex-row items-center gap-2.5 py-2.5 active:opacity-60"
				>
					<OrganizationAvatar
						name={activeOrganization?.name ?? ""}
						logo={activeOrganization?.logo}
						size={32}
					/>
					<View className="flex-1">
						<Text className="text-sm font-medium">
							{activeOrganization?.name ?? ""}
						</Text>
						<Text className="text-muted-foreground text-xs">
							<Trans>Switch organization</Trans>
						</Text>
					</View>
					<Ionicons
						name="chevron-forward"
						size={18}
						color={theme.mutedForeground}
					/>
				</Pressable>

				<View className="bg-border my-3 h-px" />

				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t({
						message: "Pages",
					})}
					onPress={() => {
						router.back();
						router.push("/(authenticated)/pages");
					}}
					className="flex-row items-center gap-2.5 py-2.5 active:opacity-60"
				>
					<Ionicons
						name="document-text-outline"
						size={28}
						color={theme.mutedForeground}
					/>
					<Text className="flex-1 text-sm font-medium">
						<Trans>Pages</Trans>
					</Text>
					<Ionicons
						name="chevron-forward"
						size={18}
						color={theme.mutedForeground}
					/>
				</Pressable>

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
