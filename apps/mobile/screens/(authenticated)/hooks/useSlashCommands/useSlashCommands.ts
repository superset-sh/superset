import type { SlashCommand } from "@superset/shared/slash-commands";
import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";

const EMPTY: SlashCommand[] = [];

/**
 * The slash commands and skills the active agent can use in this workspace,
 * fetched from the host so the list is the truth for the machine the session
 * runs on. Any failure — offline host, and specifically a host too old to
 * have the procedure (TRPC NOT_FOUND, "No procedure found") — reads as an
 * empty list: this feeds a convenience menu, never an error state.
 */
export function useSlashCommands({
	machineId,
	hostUrl,
	workspaceId,
	agent,
}: {
	machineId: string | null;
	hostUrl: string | null;
	workspaceId: string | null;
	/** definitionId ?? agentId of the active terminal row; null = plain shell. */
	agent: string | null;
}): SlashCommand[] {
	const query = useQuery({
		queryKey: ["slash-commands", machineId, workspaceId, agent],
		enabled: Boolean(hostUrl && workspaceId && agent),
		staleTime: 60_000,
		refetchOnWindowFocus: "always" as const,
		networkMode: "always" as const,
		retry: false,
		queryFn: async (): Promise<SlashCommand[]> => {
			if (!hostUrl || !workspaceId || !agent) return EMPTY;
			try {
				return await getHostServiceClientByUrl(
					hostUrl,
				).agentTooling.listSlashCommands.query({ workspaceId, agent });
			} catch {
				return EMPTY;
			}
		},
	});
	return query.data ?? EMPTY;
}
