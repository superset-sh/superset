import { PortalHost } from "@rn-primitives/portal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";

import { PostHogUserIdentifier } from "./components/PostHogUserIdentifier";
import { PostHogProvider } from "./providers/PostHogProvider";

const queryClient = new QueryClient();

export function RootLayout() {
	return (
		<QueryClientProvider client={queryClient}>
			<PostHogProvider>
				<Stack screenOptions={{ headerShown: false }} />
				<PostHogUserIdentifier />
				<PortalHost />
			</PostHogProvider>
		</QueryClientProvider>
	);
}
