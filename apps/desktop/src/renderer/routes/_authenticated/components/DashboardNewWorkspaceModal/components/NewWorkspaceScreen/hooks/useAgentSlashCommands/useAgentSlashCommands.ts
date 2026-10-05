import type { SlashCommand } from "@superset/shared/slash-commands";
import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

const EMPTY: SlashCommand[] = [];

export function useAgentSlashCommands({
	hostUrl,
	projectId,
	agent,
}: {
	hostUrl: string | null;
	projectId: string | null;
	agent: string | null;
}): SlashCommand[] {
	const { data } = useQuery({
		queryKey: ["agent-slash-commands", hostUrl, projectId, agent],
		enabled: Boolean(hostUrl && agent),
		staleTime: 30_000,
		retry: false,
		queryFn: async (): Promise<SlashCommand[]> => {
			if (!hostUrl || !agent) return EMPTY;
			try {
				return await getHostServiceClientByUrl(
					hostUrl,
				).agentTooling.listSlashCommands.query({
					projectId: projectId ?? undefined,
					agent,
				});
			} catch {
				// Hosts older than the projectId input reject the call.
				return EMPTY;
			}
		},
	});
	return data ?? EMPTY;
}
