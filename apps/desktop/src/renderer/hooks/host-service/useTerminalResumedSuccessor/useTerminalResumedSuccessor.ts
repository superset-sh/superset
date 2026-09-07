import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceEvent } from "../useWorkspaceEvent";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";

export interface TerminalResumedSuccessor {
	terminalId: string;
	label: string;
}

/**
 * Where this pane's terminal went if its agent session was resumed into a
 * fresh terminal while the pane was not mounted to hear the "resumed"
 * lifecycle event — an inactive tab, a workspace that was closed, another
 * client. Null while the terminal is alive or ended any other way.
 */
export function useTerminalResumedSuccessor(
	workspaceId: string,
	terminalId: string,
): { successor: TerminalResumedSuccessor | null; invalidate: () => void } {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();
	const queryKey = useMemo(
		() => ["terminal-resumed-successor", workspaceId, terminalId] as const,
		[workspaceId, terminalId],
	);

	const enabled =
		Boolean(workspaceId) && Boolean(terminalId) && Boolean(hostUrl);

	const { data } = useQuery({
		queryKey,
		enabled,
		queryFn: () => {
			if (!hostUrl) return null;
			return getHostServiceClientByUrl(
				hostUrl,
			).terminalAgents.resumedSuccessor.query({ workspaceId, terminalId });
		},
		staleTime: 15_000,
	});

	const invalidate = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey });
	}, [queryClient, queryKey]);

	useWorkspaceEvent("agent:lifecycle", workspaceId, invalidate, enabled);
	useWorkspaceEvent("terminal:lifecycle", workspaceId, invalidate, enabled);

	return { successor: data ?? null, invalidate };
}
