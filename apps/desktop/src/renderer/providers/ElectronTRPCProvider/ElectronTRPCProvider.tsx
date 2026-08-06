import {
	DATABASE_UNAVAILABLE_DATA_KEY,
	type DatabaseUnavailableErrorData,
} from "@superset/shared/db-connectivity-error";
import { toast } from "@superset/ui/sonner";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import {
	defaultShouldDehydrateQuery,
	focusManager,
	MutationCache,
	QueryCache,
	QueryClient,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { TRPCClientError } from "@trpc/client";
import { del, get, set } from "idb-keyval";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronReactClient } from "../../lib/trpc-client";

// In Electron, blurring the BrowserWindow keeps document.visibilityState
// "visible", so React Query's default visibilitychange listener never fires.
// Wire window focus/blur instead so refetchOnWindowFocus actually works.
// focusManager is a module-global singleton — this covers every query client
// in the renderer, including chat-service's.
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

// Most query/mutation errors are handled per-call-site (explicit `onError` +
// toast, or an inline error render) — this only catches the one case that
// otherwise fails silently everywhere: the DB-connectivity flag set by
// `packages/trpc`'s errorFormatter (see apps/api's tRPC init) when Postgres/
// Neon is unreachable, most commonly a forgotten local Docker DB stack.
const DATABASE_UNAVAILABLE_TOAST_THROTTLE_MS = 10_000;
let lastDatabaseUnavailableToastAt = 0;

function notifyIfDatabaseUnavailable(error: unknown): void {
	const isDatabaseUnavailable =
		error instanceof TRPCClientError &&
		Boolean(
			(error.data as DatabaseUnavailableErrorData | null)?.[
				DATABASE_UNAVAILABLE_DATA_KEY
			],
		);
	if (!isDatabaseUnavailable) return;

	const now = Date.now();
	if (
		now - lastDatabaseUnavailableToastAt <
		DATABASE_UNAVAILABLE_TOAST_THROTTLE_MS
	)
		return;
	lastDatabaseUnavailableToastAt = now;

	toast.error("Database unavailable", { description: error.message });
}

// Shared QueryClient for tRPC hooks and router loaders
const queryClient = new QueryClient({
	queryCache: new QueryCache({ onError: notifyIfDatabaseUnavailable }),
	mutationCache: new MutationCache({ onError: notifyIfDatabaseUnavailable }),
	defaultOptions: {
		queries: {
			networkMode: "always",
			retry: false,
		},
		mutations: {
			networkMode: "always",
			retry: false,
		},
	},
});

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
							return typeof head === "string" && PERSIST_KEY_PREFIXES.has(head);
						},
					},
				}}
			>
				{children}
			</PersistQueryClientProvider>
		</electronTrpc.Provider>
	);
}

// Export for router context
export { queryClient as electronQueryClient };
