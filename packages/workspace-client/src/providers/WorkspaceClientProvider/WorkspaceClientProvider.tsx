import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchStreamLink, TRPCClientError } from "@trpc/client";
import { createContext, type ReactNode, useContext } from "react";
import superjson from "superjson";
import { workspaceTrpc } from "../../workspace-trpc";

const STALE_TIME_MS = 5_000;
const GC_TIME_MS = 30 * 60 * 1_000;
const MAX_TIMEOUT_RETRIES = 2;
const TIMEOUT_RETRY_BASE_DELAY_MS = 300;
const MAX_CONNECTION_RETRIES = 3;
const CONNECTION_RETRY_BASE_DELAY_MS = 700;

function isTimeoutError(error: unknown): boolean {
	return error instanceof TRPCClientError && error.data?.code === "TIMEOUT";
}

// True for a request that never got a real response — connection-refused
// during a host-service restart, a dropped stream, DNS failure. tRPC only
// populates `data` from a parsed server error envelope, so its absence means
// the failure was transport-level, not the server rejecting the request.
// Without retrying these, a query in flight during a restart settles into a
// permanent error that only a manual refetch clears, even though
// host-service is back within a second or two.
function isConnectionError(error: unknown): boolean {
	return error instanceof TRPCClientError && error.data == null;
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
	hostUrl: string;
	queryClient: QueryClient;
	trpcClient: ReturnType<typeof workspaceTrpc.createClient>;
	getWsToken: () => string | null;
}

const workspaceClientsCache = new Map<string, WorkspaceClients>();
const WorkspaceClientContext =
	createContext<WorkspaceClientContextValue | null>(null);

function getWorkspaceClients(
	cacheKey: string,
	hostUrl: string,
	headers?: () => Record<string, string>,
	wsToken?: () => string | null,
): WorkspaceClients {
	const clientKey = `${cacheKey}:${hostUrl}`;
	const cached = workspaceClientsCache.get(clientKey);
	if (cached) {
		return cached;
	}

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				refetchOnWindowFocus: false,
				// Retry server-side TIMEOUT errors a couple of times — these come
				// from `queryProcedure`'s middleware when a host-service query
				// (filesystem, git) takes longer than its budget. Connection-level
				// failures (host-service restarting) get their own bounded retry.
				// Other errors fall back to a single retry as before.
				retry: (failureCount, error) => {
					if (isTimeoutError(error)) return failureCount < MAX_TIMEOUT_RETRIES;
					if (isConnectionError(error))
						return failureCount < MAX_CONNECTION_RETRIES;
					return failureCount < 1;
				},
				retryDelay: (attempt, error) => {
					if (isTimeoutError(error))
						return TIMEOUT_RETRY_BASE_DELAY_MS * (attempt + 1);
					if (isConnectionError(error))
						return CONNECTION_RETRY_BASE_DELAY_MS * (attempt + 1);
					return Math.min(1000 * 2 ** attempt, 30_000);
				},
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
				// host-service is a local connection with no HTTP cache in front of
				// it, so there's no upside to GET. Forcing POST puts query inputs in
				// the request body instead of the URL — without this, a query with a
				// large input (e.g. git.getDiffBulk's file-path list) can produce a
				// GET URL long enough to blow past the server's HTTP header-size
				// limit, failing even the CORS preflight before it reaches the route.
				methodOverride: "POST",
			}),
		],
	});

	const getWsToken = wsToken ?? (() => null);
	const clients: WorkspaceClients = {
		hostUrl,
		queryClient,
		trpcClient,
		getWsToken,
	};
	workspaceClientsCache.set(clientKey, clients);
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

/** Like `useWorkspaceClient`, but returns null outside a WorkspaceClientProvider. */
export function useMaybeWorkspaceClient(): WorkspaceClientContextValue | null {
	return useContext(WorkspaceClientContext);
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
