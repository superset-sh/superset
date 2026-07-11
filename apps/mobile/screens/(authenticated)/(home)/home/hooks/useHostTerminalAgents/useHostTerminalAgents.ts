import type { SelectV2Host } from "@superset/db/schema";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { createHostClient } from "@/lib/trpc/host-client";

export type WorkspaceAttention = "working" | "permission";

/**
 * Mirror of desktop's deriveTerminalAgentStatus: only a Start event means
 * the agent is working; anything else (Attached, Stop, ...) is idle.
 */
function attentionFromEvent(lastEventType: string): WorkspaceAttention | null {
	switch (lastEventType) {
		case "PermissionRequest":
			return "permission";
		case "Start":
			return "working";
		default:
			return null;
	}
}

/**
 * Per-workspace attention from live terminal agents on one host, via the
 * host-wide `terminalAgents.list` — a single poll instead of one per
 * workspace. Empty when the host is offline (stale statuses are worse
 * than none) or the query has no data.
 */
export function useHostTerminalAgents(
	host: SelectV2Host | null,
): Map<string, WorkspaceAttention> {
	const organizationId = host?.organizationId ?? null;
	const hostId = host?.machineId ?? null;
	const hostOnline = host?.isOnline ?? false;

	const client = useMemo(() => {
		if (!organizationId || !hostId) return null;
		return createHostClient({ organizationId, hostId });
	}, [organizationId, hostId]);

	const query = useQuery({
		queryKey: ["terminal-agents", organizationId, hostId, "all"],
		enabled: Boolean(client && hostOnline),
		refetchInterval: 5_000,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
		gcTime: 60_000,
		queryFn: async () => {
			if (!client) throw new Error("Host client unavailable");
			return client.terminalAgents.list.query();
		},
	});

	return useMemo(() => {
		const byWorkspace = new Map<string, WorkspaceAttention>();
		if (!hostOnline) return byWorkspace;
		for (const binding of query.data ?? []) {
			const attention = attentionFromEvent(binding.lastEventType);
			if (!attention) continue;
			if (byWorkspace.get(binding.workspaceId) === "permission") continue;
			if (attention === "permission" || !byWorkspace.has(binding.workspaceId)) {
				byWorkspace.set(binding.workspaceId, attention);
			}
		}
		return byWorkspace;
	}, [query.data, hostOnline]);
}
