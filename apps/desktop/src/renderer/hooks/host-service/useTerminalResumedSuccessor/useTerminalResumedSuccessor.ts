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
 * Query options for the successor lookup. Kept apart from the hook so the
 * mount policy is testable without a DOM: the lifecycle subscriptions that
 * invalidate this query exist only while a pane is mounted, so a resume
 * that happens while the pane is unmounted invalidates nothing — a cached
 * null must be re-asked on every mount, even inside `staleTime`.
 */
export function terminalResumedSuccessorQueryOptions(
	workspaceId: string,
	terminalId: string,
	fetchSuccessor: () => Promise<TerminalResumedSuccessor | null>,
) {
	return {
		queryKey: ["terminal-resumed-successor", workspaceId, terminalId] as const,
		queryFn: fetchSuccessor,
		staleTime: 15_000,
		refetchOnMount: "always" as const,
	};
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
	const options = useMemo(
		() =>
			terminalResumedSuccessorQueryOptions(workspaceId, terminalId, () =>
				hostUrl
					? getHostServiceClientByUrl(
							hostUrl,
						).terminalAgents.resumedSuccessor.query({ workspaceId, terminalId })
					: Promise.resolve(null),
			),
		[workspaceId, terminalId, hostUrl],
	);

	const enabled =
		Boolean(workspaceId) && Boolean(terminalId) && Boolean(hostUrl);

	const { data } = useQuery({ ...options, enabled });

	const { queryKey } = options;
	const invalidate = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey });
	}, [queryClient, queryKey]);

	useWorkspaceEvent("agent:lifecycle", workspaceId, invalidate, enabled);
	useWorkspaceEvent("terminal:lifecycle", workspaceId, invalidate, enabled);

	return { successor: data ?? null, invalidate };
}
