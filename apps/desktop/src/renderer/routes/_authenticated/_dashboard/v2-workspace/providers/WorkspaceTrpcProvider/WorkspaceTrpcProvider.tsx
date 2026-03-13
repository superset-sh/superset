import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import type { ReactNode } from "react";
import { workspaceTrpc } from "renderer/lib/workspace-trpc";
import superjson from "superjson";

const STALE_TIME_MS = 5_000;
const GC_TIME_MS = 30 * 60 * 1_000;

interface WorkspaceTrpcProviderProps {
	cacheKey: string;
	hostUrl: string;
	children: ReactNode;
}

type WorkspaceClients = {
	queryClient: QueryClient;
	trpcClient: ReturnType<typeof workspaceTrpc.createClient>;
};

const workspaceClientsCache = new Map<string, WorkspaceClients>();

function getWorkspaceClients(
	cacheKey: string,
	hostUrl: string,
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
			httpBatchLink({
				url: `${hostUrl}/trpc`,
				transformer: superjson,
			}),
		],
	});

	const clients = { queryClient, trpcClient };
	workspaceClientsCache.set(clientKey, clients);
	return clients;
}

export function WorkspaceTrpcProvider({
	cacheKey,
	hostUrl,
	children,
}: WorkspaceTrpcProviderProps) {
	const { queryClient, trpcClient } = getWorkspaceClients(cacheKey, hostUrl);

	return (
		<workspaceTrpc.Provider client={trpcClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</workspaceTrpc.Provider>
	);
}
