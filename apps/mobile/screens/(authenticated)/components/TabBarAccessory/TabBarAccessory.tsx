import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { ChevronsUpDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { OrganizationSwitcherSheet } from "@/screens/(authenticated)/(home)/workspaces/components/OrganizationSwitcherSheet";
import { OrganizationAvatar } from "@/screens/(authenticated)/(home)/workspaces/components/OrganizationSwitcherSheet/components/OrganizationAvatar";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";

export function TabBarAccessory() {
	const theme = useTheme();
	const router = useRouter();
	const { width } = useWindowDimensions();
	const [sheetOpen, setSheetOpen] = useState(false);
	const {
		organizations,
		activeOrganization,
		activeOrganizationId,
		switchOrganization,
	} = useOrganizations();

	const handleSwitchOrganization = (organizationId: string) => {
		setSheetOpen(false);
		switchOrganization(organizationId);
	};

	return (
		<>
			<View className="flex-row items-center justify-between px-4 py-2">
				<Pressable
					onPress={() => setSheetOpen(true)}
					className="flex-row items-center gap-2"
				>
					<OrganizationAvatar
						name={activeOrganization?.name}
						logo={activeOrganization?.logo}
						size={24}
					/>
					<Text
						className="text-sm font-semibold"
						style={{ color: theme.foreground }}
					>
						{activeOrganization?.name ?? "Organization"}
					</Text>
					<ChevronsUpDown size={12} color={theme.mutedForeground} />
				</Pressable>
				<Pressable
					onPress={() => router.push("/(authenticated)/(more)/settings")}
					hitSlop={8}
				>
					<Ionicons
						name="settings-sharp"
						size={20}
						color={theme.mutedForeground}
					/>
				</Pressable>
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
