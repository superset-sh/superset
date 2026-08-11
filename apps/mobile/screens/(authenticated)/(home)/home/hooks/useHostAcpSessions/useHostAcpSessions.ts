import type {
	SessionScopedState,
	SessionsPage,
} from "@superset/session-protocol";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { listAcpSessions } from "@/lib/host/client";

export interface AcpSessionsHost {
	organizationId: string;
	machineId: string;
	isOnline: boolean;
}

const SESSIONS_REFETCH_INTERVAL_MS = 30_000;
const SESSIONS_PAGE_LIMIT = 200;

export function getAcpSessionsQueryKey(machineId: string | null) {
	return ["acp-sessions", "list", machineId] as const;
}

export interface UseHostAcpSessionsResult {
	sessionsByWorkspace: Map<string, SessionScopedState[]>;
	/** Capability probe: the host's list answer carries `enabled`. */
	enabled: boolean;
	/**
	 * True once the host answered or failed (or is offline). Gates empty
	 * states only — existing rows always render (cache-first rule).
	 */
	isReady: boolean;
}

/**
 * ACP sessions served by one host's `acpSessions.list` over the relay,
 * host-wide (all workspaces in one page). Same healing model as
 * useHostWorkspaces: 30s poll plus focus/pull refetch.
 */
export function useHostAcpSessions(
	host: AcpSessionsHost | null,
): UseHostAcpSessionsResult {
	const routingKey = host?.isOnline
		? buildHostRoutingKey(host.organizationId, host.machineId)
		: null;

	const query = useQuery({
		queryKey: getAcpSessionsQueryKey(host?.machineId ?? null),
		enabled: routingKey !== null,
		refetchInterval: SESSIONS_REFETCH_INTERVAL_MS,
		retry: 1,
		networkMode: "always" as const,
		queryFn: async (): Promise<SessionsPage> => {
			if (!routingKey) return { items: [], nextCursor: null, enabled: false };
			return listAcpSessions(routingKey, { limit: SESSIONS_PAGE_LIMIT });
		},
	});

	const sessionsByWorkspace = useMemo(() => {
		const byWorkspace = new Map<string, SessionScopedState[]>();
		for (const session of query.data?.items ?? []) {
			const group = byWorkspace.get(session.workspaceId);
			if (group) group.push(session);
			else byWorkspace.set(session.workspaceId, [session]);
		}
		return byWorkspace;
	}, [query.data]);

	return {
		sessionsByWorkspace,
		enabled: query.data?.enabled ?? false,
		isReady: routingKey === null || query.isSuccess || query.isError,
	};
}
