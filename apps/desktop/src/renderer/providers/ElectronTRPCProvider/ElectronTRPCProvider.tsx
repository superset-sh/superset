import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import {
	defaultShouldDehydrateQuery,
	focusManager,
	QueryClient,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import {
	CLOUD_TRPC_ROUTER_ROOTS,
	cloudTrpc,
	cloudTrpcClient,
} from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	hostServiceQueryRetry,
	hostServiceQueryRetryDelay,
} from "renderer/lib/host-service-client";
import { electronReactClient } from "../../lib/trpc-client";

// In Electron, blurring the BrowserWindow keeps document.visibilityState
// "visible", so React Query's default visibilitychange listener never fires.
// Wire window focus/blur instead so refetchOnWindowFocus actually works.
// focusManager is a module-global singleton — this covers every query client
// in the renderer.
focusManager.setEventListener((handleFocus) => {
	const onFocus = () => handleFocus(true);
	const onBlur = () => handleFocus(false);
	window.addEventListener("focus", onFocus);
	window.addEventListener("blur", onBlur);
	return () => {
		window.removeEventListener("focus", onFocus);
		window.removeEventListener("blur", onBlur);
	};
});

// Bump when query response shapes change — invalidates the persisted cache.
const PERSIST_BUSTER = "v1";

// Shared QueryClient for tRPC hooks and router loaders
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			networkMode: "always",
			// Bounded, backoff-delayed retries for connection-level failures only
			// (e.g. a host-service restart) — see hostServiceQueryRetry. Anything
			// else, including real application errors, still fails on attempt one.
			retry: hostServiceQueryRetry,
			retryDelay: hostServiceQueryRetryDelay,
		},
		mutations: {
			networkMode: "always",
			retry: false,
		},
	},
});

// Cloud reads default to 30s freshness; per-site options still override.
// Scoped per router root so electron IPC queries keep staleTime 0.
for (const root of CLOUD_TRPC_ROUTER_ROOTS) {
	queryClient.setQueryDefaults([[root]], { staleTime: 30_000 });
}

// IndexedDB-backed persister. localStorage is too small (~5MB) for the
// volume of PR/issue rows we cache. idb-keyval uses a single object store
// keyed by the persister's `key` below.
const persister = createAsyncStoragePersister({
	storage: {
		getItem: async (key) => (await get<string>(key)) ?? null,
		setItem: async (key, value) => {
			await set(key, value);
		},
		removeItem: async (key) => {
			await del(key);
		},
	},
	key: "superset-rq-cache",
});

// Whitelist of queryKey prefixes worth persisting — anything else (auth
// tokens, ephemeral host state, transient mutations) is left in memory only.
const PERSIST_KEY_PREFIXES = new Set([
	"tasks", // PR/issue list infinite queries
	"pull-request-detail",
	"issue-detail",
	"dashboard-sidebar", // sidebar per-workspace PR state (badges/checks)
]);

export function ElectronTRPCProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<electronTrpc.Provider
			client={electronReactClient}
			queryClient={queryClient}
		>
			<cloudTrpc.Provider client={cloudTrpcClient} queryClient={queryClient}>
				<PersistQueryClientProvider
					client={queryClient}
					persistOptions={{
						persister,
						maxAge: 24 * 60 * 60 * 1000, // 24h
						buster: PERSIST_BUSTER,
						dehydrateOptions: {
							shouldDehydrateQuery: (query) => {
								if (!defaultShouldDehydrateQuery(query)) return false;
								const head = query.queryKey[0];
								return (
									typeof head === "string" && PERSIST_KEY_PREFIXES.has(head)
								);
							},
						},
					}}
				>
					{children}
				</PersistQueryClientProvider>
			</cloudTrpc.Provider>
		</electronTrpc.Provider>
	);
}

// Export for router context
export { queryClient as electronQueryClient };
