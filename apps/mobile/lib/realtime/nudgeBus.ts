import type { RealtimeNudgeMessage } from "@superset/shared/realtime";

type Listener = (message: RealtimeNudgeMessage) => void;

const listeners = new Set<Listener>();

/** Fan-out for nudges beyond the query cache: anything that wants to react to an agent's status changing. */
export function onRealtimeNudge(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function emitRealtimeNudge(message: RealtimeNudgeMessage): void {
	for (const listener of listeners) listener(message);
}
