import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchStreamLink } from "@trpc/client";
import { createContext, type ReactNode, useContext } from "react";
import superjson from "superjson";
import { workspaceTrpc } from "../../workspace-trpc";

const STALE_TIME_MS = 5_000;
const GC_TIME_MS = 30 * 60 * 1_000;

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
				retry: 1,
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
