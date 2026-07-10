import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { createHostClient } from "@/lib/trpc/host-client";

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

function statusFromEvent(lastEventType: string): {
	status: string;
	needsInput: boolean;
} {
	switch (lastEventType) {
		case "Start":
			return { status: "Working", needsInput: false };
		case "PermissionRequest":
			return { status: "Needs input", needsInput: true };
		case "Stop":
			return { status: "Idle", needsInput: false };
		default:
			return { status: "Active", needsInput: false };
	}
}

export interface TerminalAgentRow {
	terminalId: string;
	label: string;
	status: string;
	needsInput: boolean;
	sortKey: number;
}

/**
 * Live, read-only terminal-agent status for a workspace, read from the host over
 * the relay via `terminalAgents.listByWorkspace` (agent bindings recorded from
 * the CLI lifecycle hooks; only live sessions are returned). Degrades to an
 * empty list when the host is offline or the query fails.
 *
 * NOTE: this is an interim per-host query. Terminal session + status is not yet
 * synced to the cloud, so this only reflects the queried host while it's online.
 * The planned fix is to sync terminal state via Electric like chat_sessions —
 * see plans/cross-client-session-tab-sync.md.
 */
export function useWorkspaceTerminalAgents(workspaceId: string): {
	rows: TerminalAgentRow[];
	hostOnline: boolean;
} {
	const { workspace, host } = useWorkspaceHost(workspaceId);
	const organizationId = workspace?.organizationId ?? null;
	const hostId = workspace?.hostId ?? null;
	const hostOnline = host?.isOnline ?? false;

	const client = useMemo(() => {
		if (!organizationId || !hostId) return null;
		return createHostClient({ organizationId, hostId });
	}, [organizationId, hostId]);

	const query = useQuery({
		queryKey: ["terminal-agents", organizationId, hostId, workspaceId],
		enabled: Boolean(client && workspaceId && hostOnline),
		refetchInterval: 5_000,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
		gcTime: 60_000,
		queryFn: async () => {
			if (!client) throw new Error("Host client unavailable");
			return client.terminalAgents.listByWorkspace.query({ workspaceId });
		},
	});

	const rows = useMemo<TerminalAgentRow[]>(() => {
		return (query.data ?? [])
			.map((binding): TerminalAgentRow => {
				const { status, needsInput } = statusFromEvent(binding.lastEventType);
				return {
					terminalId: binding.terminalId,
					label: agentLabel(binding.agentId),
					status,
					needsInput,
					sortKey: binding.lastEventAt,
				};
			})
			.sort((a, b) => b.sortKey - a.sortKey);
	}, [query.data]);

	return { rows, hostOnline };
}
