import { ThemeProvider } from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Uniwind } from "uniwind";
import { NAV_THEME } from "@/lib/theme";

Uniwind.setTheme("dark");

import { PostHogUserIdentifier } from "./components/PostHogUserIdentifier";
import { PostHogProvider } from "./providers/PostHogProvider";

const queryClient = new QueryClient();

export function RootLayout() {
	return (
		<QueryClientProvider client={queryClient}>
			<PostHogProvider>
				<ThemeProvider value={NAV_THEME.dark}>
					<Stack screenOptions={{ headerShown: false }} />
					<PostHogUserIdentifier />
					<PortalHost />
				</ThemeProvider>
			</PostHogProvider>
		</QueryClientProvider>
	);
}
