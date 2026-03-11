import { useEffect, useRef, useSyncExternalStore } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { FileSystemChangeEvent } from "shared/file-tree-types";

type WorkspaceFileEventListener = (event: FileSystemChangeEvent) => void;

const listenersByWorkspace = new Map<string, Set<WorkspaceFileEventListener>>();
const countSubscribers = new Set<() => void>();

function emitListenerCountChange(): void {
	for (const subscriber of countSubscribers) {
		subscriber();
	}
}

function getListeners(workspaceId: string): Set<WorkspaceFileEventListener> {
	let listeners = listenersByWorkspace.get(workspaceId);
	if (!listeners) {
		listeners = new Set<WorkspaceFileEventListener>();
		listenersByWorkspace.set(workspaceId, listeners);
	}
	return listeners;
}

function getWorkspaceListenerCount(workspaceId: string): number {
	return listenersByWorkspace.get(workspaceId)?.size ?? 0;
}

function emitWorkspaceFileEvent(
	workspaceId: string,
	event: FileSystemChangeEvent,
): void {
	const listeners = listenersByWorkspace.get(workspaceId);
	if (!listeners || listeners.size === 0) {
		return;
	}

	for (const listener of listeners) {
		listener(event);
	}
}

export function useWorkspaceFileEvents(
	workspaceId: string,
	onEvent: WorkspaceFileEventListener,
	enabled = true,
): void {
	const onEventRef = useRef(onEvent);
	onEventRef.current = onEvent;

	useEffect(() => {
		if (!enabled || !workspaceId) {
			return;
		}

		const listeners = getListeners(workspaceId);
		const listener: WorkspaceFileEventListener = (event) => {
			onEventRef.current(event);
		};

		listeners.add(listener);
		emitListenerCountChange();

		return () => {
			const currentListeners = listenersByWorkspace.get(workspaceId);
			if (!currentListeners) {
				return;
			}

			currentListeners.delete(listener);
			if (currentListeners.size === 0) {
				listenersByWorkspace.delete(workspaceId);
			}
			emitListenerCountChange();
		};
	}, [enabled, workspaceId]);
}

function subscribeToListenerCounts(onStoreChange: () => void): () => void {
	countSubscribers.add(onStoreChange);
	return () => {
		countSubscribers.delete(onStoreChange);
	};
}

export function useWorkspaceFileEventBridge(
	workspaceId: string,
	enabled = true,
): void {
	const listenerCount = useSyncExternalStore(
		subscribeToListenerCounts,
		() => getWorkspaceListenerCount(workspaceId),
		() => 0,
	);

	electronTrpc.filesystem.subscribe.useSubscription(
		{ workspaceId },
		{
			enabled: enabled && Boolean(workspaceId) && listenerCount > 0,
			onData: (event) => {
				emitWorkspaceFileEvent(workspaceId, event);
			},
		},
	);
}
