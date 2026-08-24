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
 *
 * An empty `hostUrl` disables the query the way null does: a cloud target
 * carries `""`, and treating that as addressable used to resolve the query
 * to an empty list, which callers cannot tell from a host with no agents.
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
		enabled: enabled && Boolean(hostUrl),
		staleTime: 60_000,
		refetchOnWindowFocus: "always" as const,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!hostUrl) throw new Error("no host to list agents from");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.agentConfigs.list.query();
		},
	});
}
