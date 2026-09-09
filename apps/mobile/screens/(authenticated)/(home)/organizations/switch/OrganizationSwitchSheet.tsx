import Ionicons from "@expo/vector-icons/Ionicons";
import { useLingui } from "@lingui/react/macro";
import { Stack, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { useSession } from "@/lib/auth/client";
import { OrganizationAvatar } from "@/screens/(authenticated)/components/OrganizationAvatar";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";

export function OrganizationSwitchSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const theme = useTheme();
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
					onPress={() => router.dismissAll()}
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
							router.dismissAll();
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
			</ScrollView>
		</>
	);
}
