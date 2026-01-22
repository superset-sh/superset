import { Stack } from "expo-router";
import { CollectionsProvider } from "@/providers/CollectionsProvider";

export default function AuthenticatedLayout() {
	return (
		<CollectionsProvider>
			<Stack screenOptions={{ headerShown: false }} />
		</CollectionsProvider>
	);
}
