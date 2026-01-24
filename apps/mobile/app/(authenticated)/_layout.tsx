import { Stack } from "expo-router";
import { useDevicePresence } from "@/hooks/useDevicePresence";
import { CollectionsProvider } from "@/providers/CollectionsProvider";

export default function AuthenticatedLayout() {
	useDevicePresence();

	return (
		<CollectionsProvider>
			<Stack screenOptions={{ headerShown: false }} />
		</CollectionsProvider>
	);
}
