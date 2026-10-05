import { useSyncExternalStore } from "react";

let connected = false;
const listeners = new Set<() => void>();

export function setRealtimeConnected(next: boolean): void {
	if (next === connected) return;
	connected = next;
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** True while the nudge socket is open, so lists can stop polling. */
export function useRealtimeConnected(): boolean {
	return useSyncExternalStore(subscribe, () => connected);
}
