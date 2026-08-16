import type { HostAgentConfig } from "@superset/host-service/settings";
import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export const V2_AGENT_CONFIGS_QUERY_KEY = ["host-agent-configs"] as const;
export const V2_AGENT_CONFIGS_SESSION_QUERY_POLICY = {
	staleTime: Number.POSITIVE_INFINITY,
	refetchOnWindowFocus: false,
	refetchOnReconnect: false,
} as const;

/**
 * Caller passes the host URL explicitly so this hook works for any host the
 * user is targeting (local, remote-via-relay, or whatever the new-workspace
 * modal has resolved). Cache is keyed on URL so distinct hosts don't share
 * entries. Settings mutations update or invalidate this key for same-session
 * edits. External edits intentionally become visible on Ctrl+R with the next
 * renderer session, keeping configs and their capability snapshots on the same
 * lifecycle instead of mixing a focused config refetch with an older snapshot.
 */
export function useV2AgentConfigs(hostUrl: string | null) {
	return useQuery({
		queryKey: [...V2_AGENT_CONFIGS_QUERY_KEY, hostUrl] as const,
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return [] as HostAgentConfig[];
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.agentConfigs.list.query();
		},
		...V2_AGENT_CONFIGS_SESSION_QUERY_POLICY,
	});
}
