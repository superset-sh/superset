import type { HostAgentConfigDto } from "@superset/host-service/settings";
import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export const V2_AGENT_CONFIGS_QUERY_KEY = ["host-agent-configs"] as const;

/** Fetches v2 host-agent configs from the active host service. Shared so the
 * authenticated layout can prefetch on startup and the Settings page can read
 * the same cache without a second round-trip. */
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
	});
}
