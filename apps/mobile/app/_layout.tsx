import "react-native-get-random-values"; // MUST BE FIRST IMPORT
import "../global.css";
import { PortalHost } from "@rn-primitives/portal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { CollectionsProvider } from "@/providers/CollectionsProvider";

const queryClient = new QueryClient();

export default function RootLayout() {
	return (
		<QueryClientProvider client={queryClient}>
			<CollectionsProvider>
				<Stack screenOptions={{ headerShown: false }} />
				<PortalHost />
			</CollectionsProvider>
		</QueryClientProvider>
	);
}
