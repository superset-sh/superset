import type { SessionScopedState } from "@superset/session-protocol";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { loadWorkspaceClaudeSessions } from "@/lib/host-service/session-pages";
import { createHostSessionsApi } from "@/lib/host-service/sessions-client";

export function useWorkspaceClaudeSessions(workspaceId: string): {
	sessions: SessionScopedState[];
	hostOnline: boolean;
	sessionsReady: boolean;
} {
	const { workspace, host } = useWorkspaceHost(workspaceId);
	const organizationId = workspace?.organizationId ?? null;
	const hostId = workspace?.hostId ?? null;
	const hostOnline = host?.isOnline ?? false;
	const api = useMemo(() => {
		if (!organizationId || !hostId) return null;
		return createHostSessionsApi({ organizationId, hostId });
	}, [hostId, organizationId]);

	const query = useQuery({
		queryKey: ["claude-sdk-sessions", organizationId, hostId, workspaceId],
		enabled: Boolean(api && hostOnline),
		refetchInterval: 5_000,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
		gcTime: 60_000,
		queryFn: async () => {
			if (!api) return [];
			return loadWorkspaceClaudeSessions(api, workspaceId);
		},
	});

	return {
		sessions: query.data ?? [],
		hostOnline,
		sessionsReady: Boolean(api && hostOnline && query.isFetched),
	};
}
