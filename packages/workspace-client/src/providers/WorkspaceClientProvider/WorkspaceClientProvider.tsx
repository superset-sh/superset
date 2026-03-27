import type { WorkspaceFilesystemServerMessage } from "@superset/host-service/filesystem";
import { buildWorkspaceFilesystemEventsPath } from "@superset/host-service/filesystem";
import type { FsWatchEvent } from "@superset/workspace-fs/host";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createContext, type ReactNode, useContext } from "react";
import superjson from "superjson";
import { workspaceTrpc } from "../../workspace-trpc";

const STALE_TIME_MS = 5_000;
const GC_TIME_MS = 30 * 60 * 1_000;

export interface WorkspaceFsSubscriptionInput {
	workspaceId: string;
	onEvent: (event: FsWatchEvent) => void;
	onError?: (error: unknown) => void;
}

export interface WorkspaceClientContextValue {
	hostUrl: string;
	queryClient: QueryClient;
	subscribeToWorkspaceFsEvents: (
		input: WorkspaceFsSubscriptionInput,
	) => () => void;
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
	subscribeToWorkspaceFsEvents: (
		input: WorkspaceFsSubscriptionInput,
	) => () => void;
	getWsToken: () => string | null;
}

const workspaceClientsCache = new Map<string, WorkspaceClients>();
const WorkspaceClientContext =
	createContext<WorkspaceClientContextValue | null>(null);

function toWorkspaceFilesystemEventsUrl(
	hostUrl: string,
	workspaceId: string,
	getWsToken?: () => string | null,
): string {
	const url = new URL(buildWorkspaceFilesystemEventsPath(workspaceId), hostUrl);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	const token = getWsToken?.();
	if (token) {
		url.searchParams.set("token", token);
	}
	return url.toString();
}

function toSubscriptionError(message: string, event?: CloseEvent): Error {
	const suffix = event ? ` (code ${event.code})` : "";
	return new Error(`${message}${suffix}`);
}

function createWorkspaceFsSubscription(
	hostUrl: string,
	input: WorkspaceFsSubscriptionInput,
	getWsToken?: () => string | null,
): () => void {
	const socket = new WebSocket(
		toWorkspaceFilesystemEventsUrl(hostUrl, input.workspaceId, getWsToken),
	);
	let disposed = false;
	let opened = false;

	socket.onopen = () => {
		opened = true;
	};

	socket.onmessage = (messageEvent) => {
		let message: WorkspaceFilesystemServerMessage;
		try {
			message = JSON.parse(
				String(messageEvent.data),
			) as WorkspaceFilesystemServerMessage;
		} catch (error) {
			input.onError?.(error);
			return;
		}

		if (message.type === "error") {
			input.onError?.(new Error(message.message));
			return;
		}

		for (const event of message.events) {
			input.onEvent(event);
		}
	};

	socket.onerror = () => {
		input.onError?.(
			toSubscriptionError(
				"Workspace filesystem event stream encountered an error",
			),
		);
	};

	socket.onclose = (event) => {
		if (disposed) {
			return;
		}

		if (!opened || !event.wasClean) {
			input.onError?.(
				toSubscriptionError(
					"Workspace filesystem event stream closed unexpectedly",
					event,
				),
			);
		}
	};

	return () => {
		disposed = true;
		if (
			socket.readyState === WebSocket.CONNECTING ||
			socket.readyState === WebSocket.OPEN
		) {
			socket.close(1000, "Client unsubscribed");
		}
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
		subscribeToWorkspaceFsEvents(input) {
			return createWorkspaceFsSubscription(hostUrl, input, getWsToken);
		},
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
		subscribeToWorkspaceFsEvents: clients.subscribeToWorkspaceFsEvents,
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
	const url = new URL(path, hostUrl);
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
