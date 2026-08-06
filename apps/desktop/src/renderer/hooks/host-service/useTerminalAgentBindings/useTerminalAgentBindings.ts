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
 * Keyed by workspaceId alone (globally unique): hostUrl in the key meant a
 * host-service port change cold-started every agent chip. The queryFn
 * resolves the current host URL at fetch time.
 */
export function getTerminalAgentBindingsQueryKey(workspaceId: string) {
	return ["terminal-agent-bindings", workspaceId] as const;
}

/**
 * Shared query/invalidation plumbing behind both hooks below. `select` scopes
 * what a caller re-renders on: React Query's default structural sharing keeps
 * a `select` result referentially stable across refetches unless the
 * selected slice itself changed, so `useTerminalAgentBinding` (below) only
 * re-renders when *its* terminal's binding actually changes, not on every
 * unrelated binding update in the workspace.
 */
function useTerminalAgentBindingsQuery<TData>(
	workspaceId: string,
	options: {
		enabled?: boolean;
		select: (bindings: TerminalAgentBindings) => TData;
	},
): TData | undefined {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();
	const queryKey = useMemo(
		() => getTerminalAgentBindingsQueryKey(workspaceId),
		[workspaceId],
	);

	const enabled =
		(options.enabled ?? true) && Boolean(workspaceId) && Boolean(hostUrl);

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
		select: options.select,
	});

	const invalidate = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey });
	}, [queryClient, queryKey]);

	useWorkspaceEvent("agent:lifecycle", workspaceId, invalidate, enabled);
	useWorkspaceEvent("agent:meta", workspaceId, invalidate, enabled);
	useWorkspaceEvent("terminal:lifecycle", workspaceId, invalidate, enabled);

	return data;
}

const EMPTY_BINDINGS_MAP: Map<string, TerminalAgentBinding> = new Map();

const selectAsMap = (
	bindings: TerminalAgentBindings,
): Map<string, TerminalAgentBinding> => {
	const map = new Map<string, TerminalAgentBinding>();
	for (const binding of bindings) {
		map.set(binding.terminalId, binding);
	}
	return map;
};

/**
 * Map of `terminalId → agent binding` for a workspace, read from the host
 * store and invalidated on `agent:lifecycle` / `agent:meta` /
 * `terminal:lifecycle` events.
 */
export function useTerminalAgentBindings(
	workspaceId: string,
	options?: { enabled?: boolean },
): Map<string, TerminalAgentBinding> {
	return (
		useTerminalAgentBindingsQuery(workspaceId, {
			enabled: options?.enabled,
			select: selectAsMap,
		}) ?? EMPTY_BINDINGS_MAP
	);
}

export function useTerminalAgentBinding(
	workspaceId: string,
	terminalId: string,
): TerminalAgentBinding | undefined {
	const select = useCallback(
		(bindings: TerminalAgentBindings) =>
			bindings.find((binding) => binding.terminalId === terminalId),
		[terminalId],
	);
	return useTerminalAgentBindingsQuery(workspaceId, { select });
}
