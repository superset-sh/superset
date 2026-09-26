import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	type getHostServiceClientByUrl,
	hostServiceQueryFn,
} from "renderer/lib/host-service-client";
import { useWorkspaceConnectionRefresh } from "../useWorkspaceConnectionRefresh";
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
 * Keyed by workspaceId alone (globally unique): hostUrl in the key meant a
 * host-service port change cold-started every agent chip. The queryFn
 * resolves the current host URL at fetch time.
 */
export function getTerminalAgentBindingsQueryKey(workspaceId: string) {
	return ["terminal-agent-bindings", workspaceId] as const;
}

/**
 * Map of `terminalId → agent binding` for a workspace, read from the host
 * store and invalidated on `agent:lifecycle` / `terminal:lifecycle` events.
 */
export function useTerminalAgentBindings(
	workspaceId: string,
	options?: { enabled?: boolean },
): Map<string, TerminalAgentBinding> {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const queryKey = useMemo(
		() => getTerminalAgentBindingsQueryKey(workspaceId),
		[workspaceId],
	);

	const enabled =
		(options?.enabled ?? true) && Boolean(workspaceId) && Boolean(hostUrl);

	const { data } = useQuery({
		queryKey,
		enabled,
		queryFn: hostServiceQueryFn(hostUrl, (client, { signal }) =>
			client.terminalAgents.listByWorkspace.query({ workspaceId }, { signal }),
		),
		staleTime: 30_000,
	});

	const invalidate = useWorkspaceConnectionRefresh(
		workspaceId,
		queryKey,
		enabled,
	);

	useWorkspaceEvent("agent:lifecycle", workspaceId, invalidate, enabled);
	useWorkspaceEvent("agent:bindings-changed", workspaceId, invalidate, enabled);
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
