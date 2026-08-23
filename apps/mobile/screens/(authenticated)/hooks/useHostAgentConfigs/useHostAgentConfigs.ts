import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";

export function getHostAgentConfigsQueryKey(machineId: string | null) {
	return ["host-agent-configs", machineId] as const;
}

/**
 * The target host's configured agents, fetched live so the list matches what
 * the host can actually run. Edits usually happen on the desktop while this
 * app is backgrounded, so focus refetches unconditionally — returning to the
 * app is the earliest moment the fresh list can matter.
 */
export function useHostAgentConfigs({
	machineId,
	hostUrl,
	enabled = true,
}: {
	machineId: string | null;
	hostUrl: string | null;
	enabled?: boolean;
}) {
	return useQuery({
		queryKey: getHostAgentConfigsQueryKey(machineId),
		enabled: enabled && hostUrl !== null,
		staleTime: 60_000,
		refetchOnWindowFocus: "always" as const,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!hostUrl) return [];
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.agentConfigs.list.query();
		},
	});
}
