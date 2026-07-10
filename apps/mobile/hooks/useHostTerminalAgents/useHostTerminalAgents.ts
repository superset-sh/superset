import type { SelectV2Host } from "@superset/db/schema";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { createHostClient } from "@/lib/trpc/host-client";
import type {
	TerminalAgentStatus,
	TerminalRowLike,
} from "@/screens/(authenticated)/utils/sessionRows";

// Minimal label map for builtin terminal agents (avoids importing
// @superset/shared/agent-catalog, whose transitive deps aren't RN-vetted).
const AGENT_LABELS: Record<string, string> = {
	superset: "Superset",
	claude: "Claude Code",
	codex: "Codex",
	copilot: "Copilot",
	gemini: "Gemini",
	opencode: "OpenCode",
	cursor: "Cursor",
	amp: "Amp",
};

function agentLabel(agentId: string): string {
	return AGENT_LABELS[agentId] ?? agentId;
}

/**
 * Map an agent lifecycle event to the desktop StatusIndicator semantics:
 * a live agent whose last event isn't Stop is treated as working.
 */
function statusFromEvent(lastEventType: string): TerminalAgentStatus {
	switch (lastEventType) {
		case "PermissionRequest":
			return "permission";
		case "Stop":
			return "idle";
		default:
			return "working";
	}
}

/**
 * Live terminal-agent status for every workspace on one host, via the
 * host-wide `terminalAgents.list` — a single poll instead of one per
 * workspace. Degrades to an empty map when the host is offline or the
 * query fails.
 */
export function useHostTerminalAgents(
	host: SelectV2Host | null,
): Map<string, TerminalRowLike[]> {
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
		const byWorkspace = new Map<string, TerminalRowLike[]>();
		for (const binding of query.data ?? []) {
			const row: TerminalRowLike = {
				terminalId: binding.terminalId,
				agentId: binding.agentId,
				label: binding.title?.trim() || agentLabel(binding.agentId),
				status: statusFromEvent(binding.lastEventType),
				sortKey: binding.lastEventAt,
			};
			const group = byWorkspace.get(binding.workspaceId);
			if (group) group.push(row);
			else byWorkspace.set(binding.workspaceId, [row]);
		}
		return byWorkspace;
	}, [query.data]);
}
