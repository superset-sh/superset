import Ionicons from "@expo/vector-icons/Ionicons";
import {
	ACCOUNT_DELETION_GRACE_DAYS,
	COMPANY,
} from "@superset/shared/constants";
import * as Application from "expo-application";
import { useRouter } from "expo-router";
import { Alert, Linking, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { useDeleteAccount } from "@/hooks/useDeleteAccount";
import { useSignOut } from "@/hooks/useSignOut";
import { useTheme } from "@/hooks/useTheme";
import { useSession } from "@/lib/auth/client";
import { env } from "@/lib/env";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowValue } from "@/screens/(authenticated)/components/ListRowValue";
import { OrganizationAvatar } from "@/screens/(authenticated)/components/OrganizationAvatar";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { SettingsSection } from "./components/SettingsSection";
import { UserAvatar } from "./components/UserAvatar";

const BILLING_URL = `${env.EXPO_PUBLIC_WEB_URL ?? COMPANY.MARKETING_URL}/settings/billing`;
const WRITE_REVIEW_URL = `${COMPANY.APP_STORE_URL}?action=write-review`;

function openUrl(url: string) {
	Linking.openURL(url).catch(() => {
		Alert.alert("Could not open link", url);
	});
}

function ExternalIcon({ color }: { color: string }) {
	return <Ionicons name="open-outline" size={16} color={color} />;
}

function formatJoined(createdAt?: Date | string | null) {
	if (!createdAt) return null;
	const date = new Date(createdAt);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString(undefined, {
		month: "long",
		year: "numeric",
	});
}

export function SettingsScreen() {
	const router = useRouter();
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const { data: session } = useSession();
	const { activeOrganization } = useOrganizations();
	const { signOut, isSigningOut } = useSignOut();
	const { deleteAccount, isDeleting } = useDeleteAccount();

	const user = session?.user;
	const plan = session?.session.plan;
	const planLabel = plan ? plan[0].toUpperCase() + plan.slice(1) : "Free";
	const joined = formatJoined(user?.createdAt);

	const handleSignOut = () => {
		Alert.alert("Log out?", undefined, [
			{ style: "cancel", text: "Cancel" },
			{
				onPress: () => void signOut(),
				style: "destructive",
				text: "Log out",
			},
		]);
	};

	const handleManagePlan = () => {
		Alert.alert(
			"Manage Plan on the Web",
			`You can't change your plan in the app because it's managed on the web at ${COMPANY.DOMAIN}.`,
			[
				{ style: "cancel", text: "Dismiss" },
				{
					text: `Manage on ${COMPANY.DOMAIN}`,
					onPress: () => openUrl(BILLING_URL),
				},
			],
		);
	};

	const handleDeleteAccount = () => {
		Alert.alert(
			"Delete account?",
			`All of your data will be permanently deleted after ${ACCOUNT_DELETION_GRACE_DAYS} days. Sign back in before then to restore your account.`,
			[
				{ style: "cancel", text: "Cancel" },
				{
					style: "destructive",
					text: "Delete account",
					onPress: () => {
						deleteAccount().catch(() => {
							Alert.alert(
								"Could not delete account",
								"Something went wrong. Try again, or contact support@superset.sh.",
							);
						});
					},
				},
			],
		);
	};

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6"
			contentContainerStyle={{ paddingBottom: insets.bottom }}
		>
			<View className="items-center pt-4">
				<UserAvatar
					name={user?.name ?? "?"}
					image={user?.image}
					className="size-20"
					textClassName="text-xl"
				/>
			</View>
			<View className="gap-1 pt-5">
				<Text
					className="text-2xl font-semibold"
					style={{ color: theme.foreground }}
				>
					{user?.name}
				</Text>
				<Text className="text-base" style={{ color: theme.mutedForeground }}>
					{user?.email}
				</Text>
				<Text className="text-sm" style={{ color: theme.mutedForeground }}>
					{joined ? `${planLabel} · Joined ${joined}` : planLabel}
				</Text>
			</View>

			<SettingsSection label="Organization">
				<ListRow
					icon={
						<Ionicons
							name="people-outline"
							size={20}
							color={theme.mutedForeground}
						/>
					}
					label="Organization"
					trailing={
						<ListRowValue
							value={activeOrganization?.name ?? ""}
							accessory={
								activeOrganization ? (
									<OrganizationAvatar
										name={activeOrganization.name}
										logo={activeOrganization.logo}
										size={20}
									/>
								) : undefined
							}
						/>
					}
					onPress={() => router.push("/(authenticated)/settings/organization")}
				/>
				<ListRow
					icon={
						<Ionicons
							name="desktop-outline"
							size={20}
							color={theme.mutedForeground}
						/>
					}
					label="Hosts"
					trailing={
						<Ionicons
							name="chevron-forward"
							size={18}
							color={theme.mutedForeground}
						/>
					}
					onPress={() => router.push("/(authenticated)/settings/hosts")}
				/>
				<ListRow
					icon={
						<Ionicons
							name="sparkles-outline"
							size={20}
							color={theme.mutedForeground}
						/>
					}
					label="Agent presets"
					trailing={
						<Ionicons
							name="chevron-forward"
							size={18}
							color={theme.mutedForeground}
						/>
					}
					onPress={() => router.push("/(authenticated)/settings/presets")}
					isLast
				/>
			</SettingsSection>

			<SettingsSection label="Plan">
				<ListRow
					icon={
						<Ionicons
							name="card-outline"
							size={20}
							color={theme.mutedForeground}
						/>
					}
					label="Manage Plan"
					trailing={<ListRowValue value={planLabel} />}
					onPress={handleManagePlan}
					isLast
				/>
			</SettingsSection>

			<SettingsSection label="Support">
				<ListRow
					icon={
						<Ionicons
							name="help-circle-outline"
							size={20}
							color={theme.mutedForeground}
						/>
					}
					label="Help & Docs"
					trailing={<ExternalIcon color={theme.mutedForeground} />}
					onPress={() => openUrl(COMPANY.DOCS_URL)}
				/>
				<ListRow
					icon={
						<Ionicons
							name="logo-discord"
							size={20}
							color={theme.mutedForeground}
						/>
					}
					label="Community"
					trailing={<ExternalIcon color={theme.mutedForeground} />}
					onPress={() => openUrl(COMPANY.DISCORD_URL)}
				/>
				<ListRow
					icon={
						<Ionicons
							name="mail-outline"
							size={20}
							color={theme.mutedForeground}
						/>
					}
					label="Contact Support"
					trailing={<ExternalIcon color={theme.mutedForeground} />}
					onPress={() => openUrl(COMPANY.MAIL_TO)}
				/>
				<ListRow
					icon={
						<Ionicons
							name="star-outline"
							size={20}
							color={theme.mutedForeground}
						/>
					}
					label="Rate Superset"
					trailing={<ExternalIcon color={theme.mutedForeground} />}
					onPress={() => openUrl(WRITE_REVIEW_URL)}
					isLast
				/>
			</SettingsSection>

			<SettingsSection label="More">
				<ListRow
					icon={
						<Ionicons
							name="log-out-outline"
							size={20}
							color={theme.mutedForeground}
						/>
					}
					label="Sign out"
					onPress={isSigningOut ? undefined : handleSignOut}
					isLast
				/>
			</SettingsSection>

			<SettingsSection label="Danger Zone">
				<ListRow
					icon={
						<Ionicons
							name="trash-outline"
							size={20}
							color={theme.destructive}
						/>
					}
					label="Delete Account"
					destructive
					onPress={isDeleting ? undefined : handleDeleteAccount}
					isLast
				/>
			</SettingsSection>

			<Text
				className="pt-10 text-center text-xs uppercase"
				style={{ color: theme.mutedForeground }}
			>
				{`${COMPANY.NAME} v${Application.nativeApplicationVersion ?? "0.0.0"} (${Application.nativeBuildVersion ?? "0"})`}
			</Text>
		</ScrollView>
	);
}
