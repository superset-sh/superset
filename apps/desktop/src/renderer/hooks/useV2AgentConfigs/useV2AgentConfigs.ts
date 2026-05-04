import type { HostAgentConfigDto } from "@superset/host-service/settings";
import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export const V2_AGENT_CONFIGS_QUERY_KEY = ["host-agent-configs"] as const;

/** Shared between the startup prefetch and Settings → Agents so both share one cache entry. */
export function useV2AgentConfigs() {
	const { activeHostUrl } = useLocalHostService();

	return useQuery({
		queryKey: [...V2_AGENT_CONFIGS_QUERY_KEY, activeHostUrl] as const,
		enabled: !!activeHostUrl,
		queryFn: () => {
			if (!activeHostUrl) return [] as HostAgentConfigDto[];
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.list.query();
		},
		// Configs only change via Settings → Agents mutations, which all
		// invalidate this key explicitly. Otherwise the data is effectively
		// static — Infinity keeps the startup prefetch warm across navigation
		// instead of every consumer triggering a background refetch on mount.
		staleTime: Number.POSITIVE_INFINITY,
	});
}
