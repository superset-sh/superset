import Ionicons from "@expo/vector-icons/Ionicons";
import { useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import {
	ACCOUNT_DELETION_GRACE_DAYS,
	COMPANY,
} from "@superset/shared/constants";
import * as Application from "expo-application";
import { useRouter } from "expo-router";
import { Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { useDeleteAccount } from "@/hooks/useDeleteAccount";
import { useSignOut } from "@/hooks/useSignOut";
import { useTheme } from "@/hooks/useTheme";
import { useSession } from "@/lib/auth/client";
import { openUrl } from "@/lib/open-url";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowValue } from "@/screens/(authenticated)/components/ListRowValue";
import { OrganizationAvatar } from "@/screens/(authenticated)/components/OrganizationAvatar";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { SettingsSection } from "./components/SettingsSection";
import { UserAvatar } from "./components/UserAvatar";

const WRITE_REVIEW_URL = `${COMPANY.APP_STORE_URL}?action=write-review`;

function ExternalIcon({ color }: { color: string }) {
	return <Ionicons name="open-outline" size={16} color={color} />;
}

function formatJoined(createdAt?: Date | string | null) {
	if (!createdAt) return null;
	const date = new Date(createdAt);
	if (Number.isNaN(date.getTime())) return null;
	return formatDate(date, { month: "long", year: "numeric" });
}

export function SettingsScreen() {
	const { t } = useLingui();
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
		Alert.alert(t({ message: "Log out?" }), undefined, [
			{
				style: "cancel",
				text: t({ message: "Cancel" }),
			},
			{
				onPress: () => void signOut(),
				style: "destructive",
				text: t({ message: "Log out" }),
			},
		]);
	};

	// Informational only. Outside the US storefront, App Store guideline 3.1.1
	// rejects in-app links to an external purchase page, so the plan row says
	// where billing lives and stops there.
	const handleManagePlan = () => {
		Alert.alert(
			t({
				message: "Plan is managed on the web",
			}),
			t({
				message: `Your organization's plan is managed by its owner at ${COMPANY.DOMAIN}.`,
			}),
			[{ text: t({ message: "OK" }) }],
		);
	};

	const handleDeleteAccount = () => {
		Alert.alert(
			t({
				message: "Delete account?",
			}),
			t({
				message: `All of your data will be permanently deleted after ${ACCOUNT_DELETION_GRACE_DAYS} days. Sign back in before then to restore your account.`,
			}),
			[
				{
					style: "cancel",
					text: t({ message: "Cancel" }),
				},
				{
					style: "destructive",
					text: t({
						message: "Delete account",
					}),
					onPress: () => {
						deleteAccount().catch(() => {
							Alert.alert(
								t({
									message: "Could not delete account",
								}),
								t({
									message:
										"Something went wrong. Try again, or contact support@superset.sh.",
								}),
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
					{joined
						? t({
								message: `${planLabel} · Joined ${joined}`,
							})
						: planLabel}
				</Text>
			</View>

			<SettingsSection
				label={t({
					message: "Organization",
				})}
			>
				<ListRow
					icon={
						<Ionicons
							name="people-outline"
							size={20}
							color={theme.mutedForeground}
						/>
					}
					label={t({
						message: "Organization",
					})}
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
					label={t({ message: "Hosts" })}
					trailing={
						<Ionicons
							name="chevron-forward"
							size={18}
							color={theme.mutedForeground}
						/>
					}
					onPress={() => router.push("/(authenticated)/settings/hosts")}
					isLast
				/>
			</SettingsSection>

			<SettingsSection label={t({ message: "Plan", context: "billing" })}>
				<ListRow
					icon={
						<Ionicons
							name="card-outline"
							size={20}
							color={theme.mutedForeground}
						/>
					}
					label={t({
						message: "Manage Plan",
					})}
					trailing={<ListRowValue value={planLabel} />}
					onPress={handleManagePlan}
					isLast
				/>
			</SettingsSection>

			<SettingsSection label={t({ message: "Support" })}>
				<ListRow
					icon={
						<Ionicons
							name="help-circle-outline"
							size={20}
							color={theme.mutedForeground}
						/>
					}
					label={t({
						message: "Help & Docs",
					})}
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
					label={t({
						message: "Community",
					})}
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
					label={t({
						message: "Contact Support",
					})}
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
					label={t({
						message: "Rate Superset",
					})}
					trailing={<ExternalIcon color={theme.mutedForeground} />}
					onPress={() => openUrl(WRITE_REVIEW_URL)}
					isLast
				/>
			</SettingsSection>

			<SettingsSection label={t({ message: "More" })}>
				<ListRow
					icon={
						<Ionicons
							name="log-out-outline"
							size={20}
							color={theme.mutedForeground}
						/>
					}
					label={t({ message: "Sign out" })}
					onPress={isSigningOut ? undefined : handleSignOut}
					isLast
				/>
			</SettingsSection>

			<SettingsSection
				label={t({
					message: "Danger Zone",
				})}
			>
				<ListRow
					icon={
						<Ionicons
							name="trash-outline"
							size={20}
							color={theme.destructive}
						/>
					}
					label={t({
						message: "Delete Account",
					})}
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
