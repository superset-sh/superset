import type {
	SessionRetention,
	SessionStreamState,
	SessionsSyncState,
} from "@superset/host-service-sync/client";
import type { Session } from "@superset/host-service-sync/protocol";
import { useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { useSessionsSyncClient } from "./context";

/** Read a slice of the sync client's store; re-renders on slice change. */
export function useSessionsSyncState<T>(
	selector: (state: SessionsSyncState) => T,
): T {
	const client = useSessionsSyncClient();
	return useStore(client.store, selector);
}

export function useConnection(): SessionsSyncState["connection"] {
	return useSessionsSyncState((state) => state.connection);
}

const EMPTY_SESSIONS: Session[] = [];

/** All sessions the host stream has surfaced, newest activity first. */
export function useSessionsList(): Session[] {
	const sessionsById = useSessionsSyncState((state) => state.sessionsById);
	const sessionOrder = useSessionsSyncState((state) => state.sessionOrder);
	return useMemo(() => {
		const sessions = sessionOrder
			.map((id) => sessionsById[id])
			.filter((session): session is Session => session !== undefined);
		return sessions.length > 0 ? sessions : EMPTY_SESSIONS;
	}, [sessionsById, sessionOrder]);
}

export function useSession(sessionId: string): Session | null {
	return useSessionsSyncState((state) => state.sessionsById[sessionId] ?? null);
}

export function useSessionStream(sessionId: string): SessionStreamState | null {
	return useSessionsSyncState(
		(state) => state.streamsBySessionId[sessionId] ?? null,
	);
}

/**
 * Hold a subscription on a session's stream for the lifetime of the calling
 * component. "focused" is the reading surface; releasing drops to warm
 * retention inside the client (ref-counted, LRU-evicted).
 */
export function useRetainSession(
	sessionId: string | null,
	reason: Exclude<SessionRetention, "none"> = "focused",
): void {
	const client = useSessionsSyncClient();
	useEffect(() => {
		if (sessionId === null) return;
		return client.retainSession(sessionId, reason);
	}, [client, sessionId, reason]);
}
