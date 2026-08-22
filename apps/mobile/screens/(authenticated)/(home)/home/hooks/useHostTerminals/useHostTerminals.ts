import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import { useTerminalSeenStore } from "@/screens/(authenticated)/stores/terminalSeenStore";

export interface TerminalsHost {
	organizationId: string;
	machineId: string;
	isOnline: boolean;
	/**
	 * Poll cadence override. Session marks on a list can be lazier than the
	 * tab strip of an open workspace — and the query key is shared, so when a
	 * workspace screen also observes this host, its faster interval wins for
	 * as long as it is open.
	 */
	refetchIntervalMs?: number;
}

export type TerminalAttention = "working" | "permission" | "failed" | "review";

// Desktop's STATUS_PRIORITY: a live permission prompt is actionable right
// now; a failure is terminal; review is the least urgent.
const ATTENTION_PRIORITY: Record<TerminalAttention, number> = {
	review: 1,
	working: 2,
	failed: 3,
	permission: 4,
};

export interface TerminalRowData {
	terminalId: string;
	workspaceId: string;
	title: string;
	ts: number;
	/** Session creation time — the stable ordering key for tab strips. */
	createdAt: number;
	/** Host-clock timestamp of the binding's last agent event. */
	lastEventAt: number | null;
	/** Agent bound to the terminal via lifecycle hooks; null = plain shell. */
	agentId: string | null;
	attention: TerminalAttention | null;
}

const TERMINALS_REFETCH_INTERVAL_MS = 5_000;

export function getHostTerminalsQueryKey(machineId: string | null) {
	return ["host-terminals", "list", machineId] as const;
}

/**
 * Mirror of desktop's deriveTerminalAgentStatus. `permission` is a live
 * blocking state, never seen-gated; `review` is an unseen Stop — it clears
 * when the seen mark catches up to the binding's lastEventAt.
 */
function attentionFromEvent(
	lastEventType: string,
	lastEventAt: number,
	lastSeenAt: number | undefined,
): TerminalAttention | null {
	switch (lastEventType) {
		case "PermissionRequest":
			return "permission";
		case "Start":
			return "working";
		case "Failed":
			return "failed";
		case "Stop":
			return lastEventAt > (lastSeenAt ?? 0) ? "review" : null;
		default:
			return null;
	}
}

export interface UseHostTerminalsResult {
	terminalsByWorkspace: Map<string, TerminalRowData[]>;
	/** Per-workspace attention rollup by desktop's status priority. */
	attentionByWorkspace: Map<string, TerminalAttention>;
	/**
	 * True once the host answered or failed (or is offline). Gates empty
	 * states only — existing rows always render (cache-first rule).
	 */
	isReady: boolean;
}

/**
 * Live terminals served by a set of hosts — the host-wide `terminal.list`
 * joined with `terminalAgents.list` by terminalId, merged across hosts.
 * Terminals are the rows (they're the attachable unit and outlive their
 * agent); bindings supply what terminals can't: agent identity and attention.
 * Home passes the selected machine plus every addressed sandbox, so cloud
 * rows carry session marks the same way.
 */
export function useHostsTerminals(
	hosts: TerminalsHost[],
): UseHostTerminalsResult {
	const terminalSeenAt = useTerminalSeenStore((state) => state.terminalSeenAt);

	const online = useMemo(
		() =>
			hosts
				.filter((host) => host.isOnline)
				.map((host) => ({
					machineId: host.machineId,
					hostUrl: hostServiceUrl(host.organizationId, host.machineId),
					refetchIntervalMs:
						host.refetchIntervalMs ?? TERMINALS_REFETCH_INTERVAL_MS,
				})),
		[hosts],
	);

	const queries = useQueries({
		queries: online.map((host) => ({
			queryKey: getHostTerminalsQueryKey(host.machineId),
			refetchInterval: host.refetchIntervalMs,
			refetchIntervalInBackground: false,
			refetchOnWindowFocus: false,
			retry: 1,
			networkMode: "always" as const,
			queryFn: async () => {
				const client = getHostServiceClientByUrl(host.hostUrl);
				const [listed, bindings] = await Promise.all([
					client.terminal.list.query({}),
					client.terminalAgents.list.query(),
				]);
				return { sessions: listed.sessions, bindings };
			},
		})),
	});

	return useMemo(() => {
		const terminalsByWorkspace = new Map<string, TerminalRowData[]>();
		const attentionByWorkspace = new Map<string, TerminalAttention>();

		for (const query of queries) {
			const bindingsByTerminal = new Map(
				(query.data?.bindings ?? []).map((binding) => [
					binding.terminalId,
					binding,
				]),
			);
			for (const session of query.data?.sessions ?? []) {
				if (session.exited) continue;
				const binding = bindingsByTerminal.get(session.terminalId);
				const attention = binding
					? attentionFromEvent(
							binding.lastEventType,
							binding.lastEventAt,
							terminalSeenAt[session.terminalId],
						)
					: null;
				const row: TerminalRowData = {
					terminalId: session.terminalId,
					workspaceId: session.workspaceId,
					title: session.title ?? (binding ? binding.agentId : "Terminal"),
					ts: binding?.lastEventAt ?? session.createdAt,
					createdAt: session.createdAt,
					lastEventAt: binding?.lastEventAt ?? null,
					agentId: binding?.agentId ?? null,
					attention,
				};
				const group = terminalsByWorkspace.get(session.workspaceId);
				if (group) group.push(row);
				else terminalsByWorkspace.set(session.workspaceId, [row]);

				// Stale statuses are worse than none: attention only from live data.
				if (attention) {
					const existing = attentionByWorkspace.get(session.workspaceId);
					if (
						!existing ||
						ATTENTION_PRIORITY[attention] > ATTENTION_PRIORITY[existing]
					) {
						attentionByWorkspace.set(session.workspaceId, attention);
					}
				}
			}
		}
		for (const group of terminalsByWorkspace.values()) {
			group.sort((a, b) => b.ts - a.ts);
		}
		return {
			terminalsByWorkspace,
			attentionByWorkspace,
			isReady: queries.every((query) => query.isSuccess || query.isError),
		};
	}, [queries, terminalSeenAt]);
}

/** One host's terminals — see `useHostsTerminals`. */
export function useHostTerminals(
	host: TerminalsHost | null,
): UseHostTerminalsResult {
	const hosts = useMemo(() => (host ? [host] : []), [host]);
	return useHostsTerminals(hosts);
}
