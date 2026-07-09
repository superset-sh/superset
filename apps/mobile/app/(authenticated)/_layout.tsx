import { Stack } from "expo-router";
import { useDevicePresence } from "@/hooks/useDevicePresence";
import { CollectionsProvider } from "@/screens/(authenticated)/providers/CollectionsProvider";

const settingsScreenOptions = (title: string) => ({
	headerShown: true,
	headerBackButtonDisplayMode: "minimal" as const,
	headerShadowVisible: false,
	title,
});

export default function AuthenticatedLayout() {
	useDevicePresence();

	return (
		<CollectionsProvider>
			<Stack screenOptions={{ headerShown: false }}>
				<Stack.Screen name="(home)" />
				<Stack.Screen name="workspace/[id]" />
				<Stack.Screen
					name="settings/index"
					options={settingsScreenOptions("Settings")}
				/>
				<Stack.Screen
					name="settings/account"
					options={settingsScreenOptions("Account")}
				/>
				<Stack.Screen
					name="settings/organization"
					options={settingsScreenOptions("Organization")}
				/>
				<Stack.Screen
					name="settings/hosts"
					options={settingsScreenOptions("Hosts")}
				/>
				<Stack.Screen
					name="settings/billing"
					options={settingsScreenOptions("Billing")}
				/>
			</Stack>
		</CollectionsProvider>
	);
}
