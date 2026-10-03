import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useHostUrl } from "../useHostTargetUrl";

type RecentSessionsClient = ReturnType<
	typeof getHostServiceClientByUrl
>["terminalAgents"]["listRecentSessions"];
export type RecentAgentSession = Awaited<
	ReturnType<RecentSessionsClient["query"]>
>[number];

/**
 * The agent conversations worked on most recently on the local host, newest
 * first, for the sidebar's Sessions list. Polled rather than event-driven
 * because the list spans every workspace, including ones this window has
 * never opened and therefore receives no events for.
 */
export function useRecentAgentSessions(limit = 10): RecentAgentSession[] {
	const hostUrl = useHostUrl(null);

	const { data } = useQuery({
		queryKey: ["recent-agent-sessions", limit],
		enabled: Boolean(hostUrl),
		queryFn: () => {
			if (!hostUrl) return [];
			return getHostServiceClientByUrl(
				hostUrl,
			).terminalAgents.listRecentSessions.query({ limit });
		},
		refetchInterval: 15_000,
		staleTime: 10_000,
	});

	return data ?? [];
}
