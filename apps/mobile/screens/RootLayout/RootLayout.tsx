import AsyncStorage from "@react-native-async-storage/async-storage";
import { PortalHost } from "@rn-primitives/portal";
import { resolveLocale } from "@superset/i18n";
import { I18nProvider } from "@superset/i18n/react";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import {
	defaultShouldDehydrateQuery,
	focusManager,
	QueryClient,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { getLocales } from "expo-localization";
import { Stack, usePathname } from "expo-router";
import { ThemeProvider } from "expo-router/react-navigation";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Uniwind } from "uniwind";
import { useSession } from "@/lib/auth/client";
import { watchNetworkState } from "@/lib/errors";
import { NAV_THEME } from "@/lib/theme";

Uniwind.setTheme("dark");

import { ClientNoticesGate } from "./components/ClientNoticesGate";
import { PostHogUserIdentifier } from "./components/PostHogUserIdentifier";
import { PostHogProvider } from "./providers/PostHogProvider";

// What Home's first paint waits on, kept so a returning launch opens on rows.
// Full prefixes, not just queryKey[0]: ["cloud", "sandbox-access"] is a
// credential and must not reach disk. Decoration and terminal lists are live.
const PERSISTED_QUERY_PREFIXES = [
	["cloud", "user", "myOrganizations"],
	["cloud", "v2Host", "list"],
	["cloud", "cloudWorkspace", "list"],
	["host-service", "workspaces", "list"],
	["host-service", "projects", "list"],
] as const;

const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Bump when a persisted query's response shape changes. */
const PERSIST_BUSTER = "v1";

function isPersistedQuery(queryKey: readonly unknown[]): boolean {
	return PERSISTED_QUERY_PREFIXES.some((prefix) =>
		prefix.every((segment, index) => queryKey[index] === segment),
	);
}

const queryClient = new QueryClient();

// Evicted from memory means absent from the next write, so these must outlive
// the 5-minute default. Per prefix, not global — a day of per-row diff stats on
// a phone is what that default protects against.
for (const prefix of PERSISTED_QUERY_PREFIXES) {
	queryClient.setQueryDefaults(prefix, { gcTime: PERSIST_MAX_AGE_MS });
}

const persister = createAsyncStoragePersister({
	storage: AsyncStorage,
	key: "superset-rq-cache",
});

// Device-language inference on first load; a persisted user setting takes
// precedence once it exists (plans/20260826-i18n-strategy.md). The provider
// waits for the catalog before mounting native navigation.
const deviceLocale = resolveLocale(
	getLocales().map((locale) => locale.languageTag),
);

// Lets a failed request say "no internet connection" rather than the vaguer
// "could not reach the server" — see lib/errors.
watchNetworkState();

// React Query cannot see app focus on native, so without this no query ever
// refetches on returning to the foreground — data went stale for the whole
// app session.
AppState.addEventListener("change", (status) => {
	focusManager.setFocused(status === "active");
});

export function RootLayout() {
	const { data: session, isPending } = useSession();
	const pathname = usePathname();
	const pendingDeletion = !!session?.user.deletionRequestedAt;

	// The one rule for the native splash: it is held only while Home is still
	// waiting for content. Every other landing renders at once, so it goes as
	// soon as we know that is where we are. Home releases it itself.
	const holdingForHome = !!session && !pendingDeletion && pathname === "/";
	useEffect(() => {
		if (isPending || holdingForHome) return;
		void SplashScreen.hideAsync().catch(() => {});
	}, [isPending, holdingForHome]);

	if (isPending) return null;

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<PersistQueryClientProvider
				client={queryClient}
				persistOptions={{
					persister,
					maxAge: PERSIST_MAX_AGE_MS,
					buster: PERSIST_BUSTER,
					dehydrateOptions: {
						shouldDehydrateQuery: (query) =>
							defaultShouldDehydrateQuery(query) &&
							isPersistedQuery(query.queryKey),
					},
				}}
			>
				<PostHogProvider>
					<I18nProvider locale={deviceLocale} deferUntilReady>
						<ThemeProvider value={NAV_THEME.dark}>
							<ClientNoticesGate>
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
							</ClientNoticesGate>
							<PostHogUserIdentifier />
							<PortalHost />
						</ThemeProvider>
					</I18nProvider>
				</PostHogProvider>
			</PersistQueryClientProvider>
		</GestureHandlerRootView>
	);
}
