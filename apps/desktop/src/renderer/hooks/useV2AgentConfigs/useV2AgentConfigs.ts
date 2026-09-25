import type { HostAgentConfig } from "@superset/host-service/settings";
import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export const V2_AGENT_CONFIGS_QUERY_KEY = ["host-agent-configs"] as const;

/**
 * Caller passes the host URL explicitly so this hook works for any host the
 * user is targeting (local, remote-via-relay, or whatever the new-workspace
 * modal has resolved). Cache is keyed on URL so distinct hosts don't share
 * entries. Settings → Agents mutations invalidate this key for instant
 * same-session updates; the bounded staleTime and unconditional focus refetch
 * exist for writes that bypass the renderer (CLI, host-service restarts, other
 * clients on the same host), which previously stayed invisible until an app
 * restart. Acting on an external edit means refocusing the app, so focus is
 * the earliest moment the fresh value can matter.
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
		staleTime: 30_000,
		refetchOnWindowFocus: "always",
	});
}
