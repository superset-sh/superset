import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";

export interface TerminalResumedSuccessor {
	terminalId: string;
	label: string;
}

export function getTerminalResumedSuccessorQueryKey(
	workspaceId: string,
	terminalId: string,
) {
	return ["terminal-resumed-successor", workspaceId, terminalId] as const;
}

/**
 * Where this pane's terminal went if its agent session was resumed into a
 * fresh terminal while the pane was not mounted to hear the "resumed"
 * lifecycle event — an inactive tab, a workspace that was closed, another
 * client. Null while the terminal is alive or ended any other way. Asked
 * on mount and whenever the caller says the terminal is not connected,
 * never cached across mounts: the pane has no subscription while unmounted,
 * so an earlier null says nothing about what happened since.
 */
export function useTerminalResumedSuccessor(
	workspaceId: string,
	terminalId: string,
	{ enabled: shouldAsk = true }: { enabled?: boolean } = {},
): TerminalResumedSuccessor | null {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const enabled =
		shouldAsk &&
		Boolean(workspaceId) &&
		Boolean(terminalId) &&
		Boolean(hostUrl);

	const { data } = useQuery({
		queryKey: getTerminalResumedSuccessorQueryKey(workspaceId, terminalId),
		enabled,
		queryFn: () => {
			if (!hostUrl) return null;
			return getHostServiceClientByUrl(
				hostUrl,
			).terminalAgents.resumedSuccessor.query({ workspaceId, terminalId });
		},
		staleTime: 0,
	});

	return data ?? null;
}
