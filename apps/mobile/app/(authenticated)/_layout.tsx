import { Stack } from "expo-router";
import { useDevicePresence } from "@/hooks/useDevicePresence";
import { CollectionsProvider } from "@/screens/(authenticated)/providers/CollectionsProvider";

export default function AuthenticatedLayout() {
	useDevicePresence();

	return (
		<CollectionsProvider>
			<Stack screenOptions={{ headerShown: false }}>
				<Stack.Screen name="(home)" />
				<Stack.Screen name="workspace/[id]" />
				<Stack.Screen name="settings" />
			</Stack>
		</CollectionsProvider>
	);
}
