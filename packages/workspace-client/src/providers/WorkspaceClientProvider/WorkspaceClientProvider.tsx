import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchStreamLink, TRPCClientError } from "@trpc/client";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import superjson from "superjson";
import { workspaceTrpc } from "../../workspace-trpc";
import {
	getIdleWorkspaceClientEvictionKeys,
	WORKSPACE_CLIENT_IDLE_DISPOSE_MS,
} from "./workspaceClientCachePolicy";

const STALE_TIME_MS = 5_000;
const GC_TIME_MS = 5 * 60 * 1_000;
const MAX_TIMEOUT_RETRIES = 2;
const TIMEOUT_RETRY_BASE_DELAY_MS = 300;

function isTimeoutError(error: unknown): boolean {
	return error instanceof TRPCClientError && error.data?.code === "TIMEOUT";
}

export interface WorkspaceClientContextValue {
	hostUrl: string;
	queryClient: QueryClient;
	trpcClient: ReturnType<typeof workspaceTrpc.createClient>;
	getWsToken: () => string | null;
}

interface WorkspaceClientProviderProps {
	cacheKey: string;
	hostUrl: string;
	children: ReactNode;
	headers?: () => Record<string, string>;
	wsToken?: () => string | null;
}

interface WorkspaceClients {
	clientKey: string;
	hostUrl: string;
	queryClient: QueryClient;
	trpcClient: ReturnType<typeof workspaceTrpc.createClient>;
	getWsToken: () => string | null;
	activeRefs: number;
	lastAccessedAt: number;
	disposeTimer: ReturnType<typeof setTimeout> | null;
}

const workspaceClientsCache = new Map<string, WorkspaceClients>();
const WorkspaceClientContext =
	createContext<WorkspaceClientContextValue | null>(null);

function disposeWorkspaceClients(clientKey: string): void {
	const clients = workspaceClientsCache.get(clientKey);
	if (!clients || clients.activeRefs > 0) return;
	if (clients.disposeTimer) {
		clearTimeout(clients.disposeTimer);
		clients.disposeTimer = null;
	}
	clients.queryClient.clear();
	workspaceClientsCache.delete(clientKey);
}

function evictIdleWorkspaceClients(protectedKey?: string): void {
	const keys = getIdleWorkspaceClientEvictionKeys(
		Array.from(workspaceClientsCache.values(), (clients) => ({
			key: clients.clientKey,
			activeRefs: clients.activeRefs,
			lastAccessedAt: clients.lastAccessedAt,
		})),
		undefined,
		protectedKey,
	);

	for (const key of keys) {
		disposeWorkspaceClients(key);
	}
}

function scheduleWorkspaceClientsDispose(clients: WorkspaceClients): void {
	if (clients.disposeTimer) {
		clearTimeout(clients.disposeTimer);
	}
	clients.disposeTimer = setTimeout(() => {
		disposeWorkspaceClients(clients.clientKey);
	}, WORKSPACE_CLIENT_IDLE_DISPOSE_MS);
}

function retainWorkspaceClients(clients: WorkspaceClients): () => void {
	clients.activeRefs++;
	clients.lastAccessedAt = Date.now();
	if (clients.disposeTimer) {
		clearTimeout(clients.disposeTimer);
		clients.disposeTimer = null;
	}
	evictIdleWorkspaceClients(clients.clientKey);

	return () => {
		clients.activeRefs = Math.max(0, clients.activeRefs - 1);
		clients.lastAccessedAt = Date.now();
		if (clients.activeRefs === 0) {
			scheduleWorkspaceClientsDispose(clients);
		}
		evictIdleWorkspaceClients();
	};
}

function getWorkspaceClients(
	cacheKey: string,
	hostUrl: string,
	headers?: () => Record<string, string>,
	wsToken?: () => string | null,
): WorkspaceClients {
	const clientKey = `${cacheKey}:${hostUrl}`;
	const cached = workspaceClientsCache.get(clientKey);
	if (cached) {
		cached.lastAccessedAt = Date.now();
		if (cached.disposeTimer) {
			clearTimeout(cached.disposeTimer);
			cached.disposeTimer = null;
		}
		return cached;
	}

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				refetchOnWindowFocus: false,
				// Retry server-side TIMEOUT errors a couple of times — these come
				// from `queryProcedure`'s middleware when a host-service query
				// (filesystem, git) takes longer than its budget. Other errors
				// fall back to a single retry as before.
				retry: (failureCount, error) => {
					if (isTimeoutError(error)) return failureCount < MAX_TIMEOUT_RETRIES;
					return failureCount < 1;
				},
				retryDelay: (attempt, error) =>
					isTimeoutError(error)
						? TIMEOUT_RETRY_BASE_DELAY_MS * (attempt + 1)
						: Math.min(1000 * 2 ** attempt, 30_000),
				staleTime: STALE_TIME_MS,
				gcTime: GC_TIME_MS,
			},
		},
	});

	const trpcClient = workspaceTrpc.createClient({
		links: [
			httpBatchStreamLink({
				url: `${hostUrl}/trpc`,
				transformer: superjson,
				headers: headers ?? (() => ({})),
			}),
		],
	});

	const getWsToken = wsToken ?? (() => null);
	const clients: WorkspaceClients = {
		clientKey,
		hostUrl,
		queryClient,
		trpcClient,
		getWsToken,
		activeRefs: 0,
		lastAccessedAt: Date.now(),
		disposeTimer: null,
	};
	workspaceClientsCache.set(clientKey, clients);
	evictIdleWorkspaceClients(clientKey);
	return clients;
}

export function WorkspaceClientProvider({
	cacheKey,
	hostUrl,
	headers,
	wsToken,
	children,
}: WorkspaceClientProviderProps) {
	const clients = getWorkspaceClients(cacheKey, hostUrl, headers, wsToken);
	useEffect(() => retainWorkspaceClients(clients), [clients]);

	const contextValue: WorkspaceClientContextValue = {
		hostUrl: clients.hostUrl,
		queryClient: clients.queryClient,
		trpcClient: clients.trpcClient,
		getWsToken: clients.getWsToken,
	};

	return (
		<WorkspaceClientContext.Provider value={contextValue}>
			<workspaceTrpc.Provider
				client={clients.trpcClient}
				queryClient={clients.queryClient}
			>
				<QueryClientProvider client={clients.queryClient}>
					{children}
				</QueryClientProvider>
			</workspaceTrpc.Provider>
		</WorkspaceClientContext.Provider>
	);
}

export function useWorkspaceClient(): WorkspaceClientContextValue {
	const client = useContext(WorkspaceClientContext);
	if (!client) {
		throw new Error(
			"useWorkspaceClient must be used within WorkspaceClientProvider",
		);
	}

	return client;
}

export function useWorkspaceHostUrl(): string {
	return useWorkspaceClient().hostUrl;
}

export function useWorkspaceWsUrl(
	path: string,
	params?: Record<string, string>,
): string {
	const { hostUrl, getWsToken } = useWorkspaceClient();
	const url = new URL(`${hostUrl}${path}`);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	if (params) {
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}
	}
	const token = getWsToken();
	if (token) {
		url.searchParams.set("token", token);
	}
	return url.toString();
}
