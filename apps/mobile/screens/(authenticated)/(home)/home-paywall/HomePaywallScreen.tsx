import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { useSession } from "@/lib/auth/client";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { OrganizationHeaderButton } from "../home/components/OrganizationHeaderButton";
import { OrganizationSwitcherSheet } from "../home/components/OrganizationSwitcherSheet";

/** Home content for accounts whose active org has no paid plan. The shell
 * stays fully navigable — the org switcher sheet also carries the Settings
 * entry, so plan changes, org switches, and account deletion all use the
 * normal surfaces. The trpc middleware is the actual wall. */
export function HomePaywallScreen() {
	const theme = useTheme();
	const { width } = useWindowDimensions();
	const { refetch } = useSession();
	const {
		organizations,
		activeOrganization,
		activeOrganizationId,
		switchOrganization,
	} = useOrganizations();
	const [sheetOpen, setSheetOpen] = useState(false);

	const handleSwitchOrganization = (organizationId: string) => {
		setSheetOpen(false);
		void switchOrganization(organizationId).then(() => refetch());
	};

	return (
		<>
			<OrganizationHeaderButton
				name={activeOrganization?.name}
				logo={activeOrganization?.logo}
				onPress={() => {
					void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					setSheetOpen(true);
				}}
			/>
			<View className="flex-1 items-center justify-center gap-6 bg-background p-6">
				<View
					className="size-16 items-center justify-center rounded-full"
					style={{ backgroundColor: theme.muted }}
				>
					<Ionicons name="lock-closed" size={32} color={theme.foreground} />
				</View>

				<View className="items-center gap-2">
					<Text className="text-2xl font-semibold text-foreground">
						Superset Mobile is part of Pro
					</Text>
					<Text className="text-center text-base text-muted-foreground">
						{activeOrganization
							? `${activeOrganization.name} is on the Free plan. Superset Mobile is available for organizations on Pro.`
							: "This organization is on the Free plan. Superset Mobile is available for organizations on Pro."}
					</Text>
				</View>

				<Button size="lg" className="w-4/5" onPress={() => void refetch()}>
					<Text>Refresh</Text>
				</Button>
			</View>
			<OrganizationSwitcherSheet
				isPresented={sheetOpen}
				onIsPresentedChange={setSheetOpen}
				organizations={organizations}
				activeOrganizationId={activeOrganizationId}
				onSwitchOrganization={handleSwitchOrganization}
				width={width}
			/>
		</>
	);
}
