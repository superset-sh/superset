import type { AppRouter } from "@superset/host-service";
import {
	type QueryClient,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useMemo } from "react";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { isAgentChoiceVisible } from "./agentChoiceAvailability";
import {
	hostAgentCapabilityRefreshQueryKey,
	hostAgentCapabilitySnapshotQueryKey,
} from "./capabilityQueryKeys";

type HostServiceRouterOutputs = inferRouterOutputs<AppRouter>;

export type AgentChoiceCapability =
	HostServiceRouterOutputs["settings"]["agentConfigs"]["listCapabilitySnapshots"][number];

interface UseV2AgentChoicesResult {
	agents: AgentSelectAgent[];
	capabilitiesByAgentId: ReadonlyMap<string, AgentChoiceCapability>;
	isFetched: boolean;
}

interface UseV2AgentChoicesOptions {
	refresh?: boolean;
}

export async function publishCapabilityRefresh(
	queryClient: QueryClient,
	hostUrl: string,
	refreshed: AgentChoiceCapability[],
): Promise<void> {
	const snapshotKey = hostAgentCapabilitySnapshotQueryKey(hostUrl);
	// A cold snapshot read may still be in flight. Cancel it before publishing
	// the newer refresh so its older response cannot win the race afterward.
	await queryClient.cancelQueries({ queryKey: snapshotKey });
	queryClient.setQueryData(snapshotKey, refreshed);
}

export function useV2AgentChoices(
	hostUrl: string | null,
	options: UseV2AgentChoicesOptions = {},
): UseV2AgentChoicesResult {
	const queryClient = useQueryClient();
	const query = useV2AgentConfigs(hostUrl);
	const refreshEnabled = options.refresh !== false;
	const snapshotsQuery = useQuery({
		queryKey: hostAgentCapabilitySnapshotQueryKey(hostUrl),
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return [] satisfies AgentChoiceCapability[];
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.agentConfigs.listCapabilitySnapshots.query();
		},
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
	});
	useQuery({
		queryKey: hostAgentCapabilityRefreshQueryKey(hostUrl),
		enabled: !!hostUrl && refreshEnabled,
		queryFn: async () => {
			if (!hostUrl) return 0;
			const refreshed = await getHostServiceClientByUrl(
				hostUrl,
			).settings.agentConfigs.refreshCapabilities.mutate({});
			await publishCapabilityRefresh(queryClient, hostUrl, refreshed);
			return refreshed.length;
		},
		// One explicit refresh per host and renderer lifetime. Ctrl+R creates a new
		// QueryClient, while focus, reconnects, and additional picker mounts reuse
		// this settled session query.
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		retry: false,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
	const capabilitiesByAgentId = useMemo(
		() =>
			new Map(
				(snapshotsQuery.data ?? []).map((capability) => [
					capability.agentId,
					capability,
				]),
			),
		[snapshotsQuery.data],
	);
	const isFetched = query.isFetched;
	const agents = useMemo<AgentSelectAgent[]>(() => {
		if (!query.data || !isFetched) return [];
		return query.data
			.filter((config) =>
				isAgentChoiceVisible(capabilitiesByAgentId.get(config.id)),
			)
			.map((config) => ({
				id: config.id,
				label: config.label,
				// Prefer the user's icon override (built-in key or uploaded data
				// URI); fall back to the preset-implied icon.
				iconId: config.iconId ?? config.presetId,
				presetId: config.presetId,
			}));
	}, [capabilitiesByAgentId, isFetched, query.data]);

	return {
		agents,
		capabilitiesByAgentId,
		isFetched,
	};
}
