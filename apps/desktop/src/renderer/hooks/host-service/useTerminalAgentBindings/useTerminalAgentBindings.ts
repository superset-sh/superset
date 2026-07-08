import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceEvent } from "../useWorkspaceEvent";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";

type ListByWorkspaceClient = ReturnType<
	typeof getHostServiceClientByUrl
>["terminalAgents"]["listByWorkspace"];
type TerminalAgentBindings = Awaited<
	ReturnType<ListByWorkspaceClient["query"]>
>;
export type TerminalAgentBinding = TerminalAgentBindings[number];

/**
 * Map of `terminalId → agent binding` for a workspace, read from the host
 * store and invalidated on `agent:lifecycle` / `terminal:lifecycle` events.
 */
export function useTerminalAgentBindings(
	workspaceId: string,
	options?: { enabled?: boolean },
): Map<string, TerminalAgentBinding> {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();
	const queryKey = useMemo(
		() => ["terminal-agent-bindings", hostUrl, workspaceId] as const,
		[hostUrl, workspaceId],
	);

	const enabled =
		(options?.enabled ?? true) && Boolean(workspaceId) && Boolean(hostUrl);

	const { data } = useQuery({
		queryKey,
		enabled,
		queryFn: () => {
			if (!hostUrl) return [] as TerminalAgentBindings;
			return getHostServiceClientByUrl(
				hostUrl,
			).terminalAgents.listByWorkspace.query({ workspaceId });
		},
		// Lifecycle events invalidate for instant updates; the finite
		// staleTime lets focus/remount refetches self-heal any staleness
		// from events missed while the WS was down (host restart, sleep).
		staleTime: 30_000,
	});

	const invalidate = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey });
	}, [queryClient, queryKey]);

	useWorkspaceEvent("agent:lifecycle", workspaceId, invalidate, enabled);
	useWorkspaceEvent("terminal:lifecycle", workspaceId, invalidate, enabled);

	return useMemo(() => {
		const map = new Map<string, TerminalAgentBinding>();
		for (const binding of data ?? []) {
			map.set(binding.terminalId, binding);
		}
		return map;
	}, [data]);
}

export function useTerminalAgentBinding(
	workspaceId: string,
	terminalId: string,
): TerminalAgentBinding | undefined {
	const bindings = useTerminalAgentBindings(workspaceId);
	return bindings.get(terminalId);
}
