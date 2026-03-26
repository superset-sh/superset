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
	sessionToken: string | null;
	queryClient: QueryClient;
	subscribeToWorkspaceFsEvents: (
		input: WorkspaceFsSubscriptionInput,
	) => () => void;
}

interface WorkspaceClientProviderProps {
	cacheKey: string;
	hostUrl: string;
	sessionToken?: string | null;
	children: ReactNode;
}

interface WorkspaceClients extends WorkspaceClientContextValue {
	trpcClient: ReturnType<typeof workspaceTrpc.createClient>;
}

const workspaceClientsCache = new Map<string, WorkspaceClients>();
const WorkspaceClientContext =
	createContext<WorkspaceClientContextValue | null>(null);

function toWorkspaceFilesystemEventsUrl(
	hostUrl: string,
	workspaceId: string,
	sessionToken?: string | null,
): string {
	const url = new URL(buildWorkspaceFilesystemEventsPath(workspaceId), hostUrl);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	if (sessionToken) {
		url.searchParams.set("sessionToken", sessionToken);
	}
	return url.toString();
}

function toSubscriptionError(message: string, event?: CloseEvent): Error {
	const suffix = event ? ` (code ${event.code})` : "";
	return new Error(`${message}${suffix}`);
}

function createWorkspaceFsSubscription(
	hostUrl: string,
	sessionToken: string | null,
	input: WorkspaceFsSubscriptionInput,
): () => void {
	const socket = new WebSocket(
		toWorkspaceFilesystemEventsUrl(hostUrl, input.workspaceId, sessionToken),
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
	sessionToken: string | null,
): WorkspaceClients {
	const clientKey = `${cacheKey}:${hostUrl}:${sessionToken ?? ""}`;
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
				headers: () =>
					sessionToken
						? {
								Authorization: `Bearer ${sessionToken}`,
							}
						: {},
			}),
		],
	});

	const clients: WorkspaceClients = {
		hostUrl,
		sessionToken,
		queryClient,
		trpcClient,
		subscribeToWorkspaceFsEvents(input) {
			return createWorkspaceFsSubscription(hostUrl, sessionToken, input);
		},
	};
	workspaceClientsCache.set(clientKey, clients);
	return clients;
}

export function WorkspaceClientProvider({
	cacheKey,
	hostUrl,
	sessionToken = null,
	children,
}: WorkspaceClientProviderProps) {
	const clients = getWorkspaceClients(cacheKey, hostUrl, sessionToken);
	const contextValue: WorkspaceClientContextValue = {
		hostUrl: clients.hostUrl,
		sessionToken: clients.sessionToken,
		queryClient: clients.queryClient,
		subscribeToWorkspaceFsEvents: clients.subscribeToWorkspaceFsEvents,
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

export function useWorkspaceSessionToken(): string | null {
	return useWorkspaceClient().sessionToken;
}
