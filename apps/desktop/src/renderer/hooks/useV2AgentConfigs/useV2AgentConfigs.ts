import type { HostAgentConfig } from "@superset/host-service/settings";
import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export const V2_AGENT_CONFIGS_QUERY_KEY = ["host-agent-configs"] as const;

/**
 * Caller passes the host URL explicitly so this hook works for any host the
 * user is targeting (local, remote-via-relay, or whatever the new-workspace
 * modal has resolved). Cache is keyed on URL so distinct hosts don't share
 * entries. Configs only change via Settings → Agents mutations that invalidate
 * this key — `staleTime: Infinity` keeps the startup prefetch warm across
 * navigation instead of every consumer refetching on mount.
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
		staleTime: Number.POSITIVE_INFINITY,
	});
}
