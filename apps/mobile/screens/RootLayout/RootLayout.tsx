import { PortalHost } from "@rn-primitives/portal";
import { initI18n, resolveLocale } from "@superset/i18n";
import { I18nProvider } from "@superset/i18n/react";
import {
	focusManager,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { getLocales } from "expo-localization";
import { Stack } from "expo-router";
import { ThemeProvider } from "expo-router/react-navigation";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Uniwind } from "uniwind";
import { useSession } from "@/lib/auth/client";
import { NAV_THEME } from "@/lib/theme";

Uniwind.setTheme("dark");

import { PostHogUserIdentifier } from "./components/PostHogUserIdentifier";
import { PostHogProvider } from "./providers/PostHogProvider";

const queryClient = new QueryClient();

// Device-language inference on first load; a persisted user setting takes
// precedence once it exists (plans/20260826-i18n-strategy.md). Activated at
// module scope so the first frame renders in the device language.
const deviceLocale = resolveLocale(
	getLocales().map((locale) => locale.languageTag),
);
initI18n(deviceLocale);

// React Query cannot see app focus on native, so without this no query ever
// refetches on returning to the foreground — data went stale for the whole
// app session.
AppState.addEventListener("change", (status) => {
	focusManager.setFocused(status === "active");
});

export function RootLayout() {
	const { data: session, isPending } = useSession();

	if (isPending) return null;

	const pendingDeletion = !!session?.user.deletionRequestedAt;

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<QueryClientProvider client={queryClient}>
				<PostHogProvider>
					<I18nProvider locale={deviceLocale}>
						<ThemeProvider value={NAV_THEME.dark}>
							<Stack screenOptions={{ headerShown: false }}>
								<Stack.Protected guard={!!session && !pendingDeletion}>
									<Stack.Screen name="(authenticated)" />
								</Stack.Protected>
								<Stack.Protected guard={pendingDeletion}>
									<Stack.Screen name="account-pending-deletion" />
								</Stack.Protected>
								<Stack.Protected guard={!session}>
									<Stack.Screen name="(auth)" />
								</Stack.Protected>
							</Stack>
							<PostHogUserIdentifier />
							<PortalHost />
						</ThemeProvider>
					</I18nProvider>
				</PostHogProvider>
			</QueryClientProvider>
		</GestureHandlerRootView>
	);
}
