import type { Session } from "@superset/host-service-sync/protocol";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { listSessions } from "@/lib/host/client";

export interface SessionsHost {
	organizationId: string;
	machineId: string;
	isOnline: boolean;
}

const SESSIONS_REFETCH_INTERVAL_MS = 30_000;

export function getSessionsQueryKey(machineId: string | null) {
	return ["sessions", "list", machineId] as const;
}

export interface UseHostSessionsResult {
	sessionsByWorkspace: Map<string, Session[]>;
	/**
	 * Capability probe: hosts without the sessions surface (pre-release gate
	 * off) answer the list with an error, which reads as disabled here.
	 */
	enabled: boolean;
	/**
	 * True once the host answered or failed (or is offline). Gates empty
	 * states only — existing rows always render (cache-first rule).
	 */
	isReady: boolean;
}

/**
 * Canonical sessions served by one host's `sessions.list` over the relay,
 * host-wide (all workspaces in one snapshot). Same healing model as
 * useHostWorkspaces: 30s poll plus focus/pull refetch. The thread screen
 * itself rides the live `/sessions/sync` socket — this list is the cheap
 * cold surface behind the home and workspace screens.
 */
export function useHostSessions(
	host: SessionsHost | null,
): UseHostSessionsResult {
	const routingKey = host?.isOnline
		? buildHostRoutingKey(host.organizationId, host.machineId)
		: null;

	const query = useQuery({
		queryKey: getSessionsQueryKey(host?.machineId ?? null),
		enabled: routingKey !== null,
		refetchInterval: SESSIONS_REFETCH_INTERVAL_MS,
		retry: 1,
		networkMode: "always" as const,
		queryFn: async (): Promise<Session[]> => {
			if (!routingKey) return [];
			const snapshot = await listSessions(routingKey);
			return snapshot.sessions;
		},
	});

	const sessionsByWorkspace = useMemo(() => {
		const byWorkspace = new Map<string, Session[]>();
		for (const session of query.data ?? []) {
			const group = byWorkspace.get(session.workspaceId);
			if (group) group.push(session);
			else byWorkspace.set(session.workspaceId, [session]);
		}
		return byWorkspace;
	}, [query.data]);

	return {
		sessionsByWorkspace,
		enabled: query.isSuccess,
		isReady: routingKey === null || query.isSuccess || query.isError,
	};
}
