import type { FsWatchEvent } from "@superset/workspace-fs/host";
import type {
	WorkspaceClientContextValue,
	WorkspaceFsSubscriptionInput,
} from "../providers/WorkspaceClientProvider";

export type WorkspaceFsEventListener = (event: FsWatchEvent) => void;

interface WorkspaceFsSubscriptionState {
	bridgeCount: number;
	client: WorkspaceClientContextValue;
	listeners: Set<WorkspaceFsEventListener>;
	unsubscribeTransport: (() => void) | null;
	workspaceId: string;
}

const subscriptions = new Map<string, WorkspaceFsSubscriptionState>();

function getSubscriptionKey(
	client: WorkspaceClientContextValue,
	workspaceId: string,
): string {
	return `${client.hostUrl}:${workspaceId}`;
}

function getOrCreateSubscription(
	client: WorkspaceClientContextValue,
	workspaceId: string,
): WorkspaceFsSubscriptionState {
	const key = getSubscriptionKey(client, workspaceId);
	const existing = subscriptions.get(key);
	if (existing) {
		return existing;
	}

	const nextState: WorkspaceFsSubscriptionState = {
		bridgeCount: 0,
		client,
		listeners: new Set<WorkspaceFsEventListener>(),
		unsubscribeTransport: null,
		workspaceId,
	};
	subscriptions.set(key, nextState);
	return nextState;
}

function removeSubscriptionIfInactive(
	state: WorkspaceFsSubscriptionState,
): void {
	if (state.bridgeCount > 0 || state.listeners.size > 0) {
		return;
	}

	state.unsubscribeTransport?.();
	state.unsubscribeTransport = null;
	subscriptions.delete(getSubscriptionKey(state.client, state.workspaceId));
}

function ensureTransport(state: WorkspaceFsSubscriptionState): void {
	if (state.unsubscribeTransport) {
		return;
	}

	if (state.bridgeCount === 0 && state.listeners.size === 0) {
		return;
	}

	const input: WorkspaceFsSubscriptionInput = {
		workspaceId: state.workspaceId,
		onEvent: (event) => {
			for (const listener of state.listeners) {
				listener(event);
			}
		},
		onError: (error) => {
			console.error("[workspace-client/fs-events] Stream failed:", {
				hostUrl: state.client.hostUrl,
				workspaceId: state.workspaceId,
				error,
			});
		},
	};

	state.unsubscribeTransport = state.client.subscribeToWorkspaceFsEvents(input);
}

export function retainWorkspaceFsBridge(
	client: WorkspaceClientContextValue,
	workspaceId: string,
): () => void {
	const state = getOrCreateSubscription(client, workspaceId);
	state.bridgeCount += 1;
	ensureTransport(state);

	return () => {
		state.bridgeCount = Math.max(0, state.bridgeCount - 1);
		removeSubscriptionIfInactive(state);
	};
}

export function subscribeToWorkspaceFsEvents(
	client: WorkspaceClientContextValue,
	workspaceId: string,
	listener: WorkspaceFsEventListener,
): () => void {
	const state = getOrCreateSubscription(client, workspaceId);
	state.listeners.add(listener);
	ensureTransport(state);

	return () => {
		state.listeners.delete(listener);
		removeSubscriptionIfInactive(state);
	};
}
