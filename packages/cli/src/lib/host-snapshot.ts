import {
	type AgentRunState,
	agentRunState,
} from "@superset/shared/agent-status";
import type { PaneLayoutSnapshot } from "@superset/shared/pane-layout-ops";
import { formatLayout } from "./pane-layout-format";

interface WorkspaceRow {
	id: string;
	name: string;
	branch?: string | null;
	projectName?: string | null;
}

interface TerminalRow {
	terminalId: string;
	workspaceId: string;
	title: string | null;
}

interface AgentRow {
	terminalId: string;
	agentId: string;
	lastEventType: string;
}

export interface SnapshotWorkspace {
	id: string;
	name: string;
	project: string | null;
	branch: string | null;
	terminals: {
		id: string;
		title: string | null;
		agent: { id: string; state: AgentRunState } | null;
	}[];
	/** Null when no desktop app is attached to the host, or it is too old. */
	layout: PaneLayoutSnapshot | null;
}

export function buildSnapshot({
	workspaces,
	terminals,
	agents,
	layouts,
}: {
	workspaces: WorkspaceRow[];
	terminals: TerminalRow[];
	agents: AgentRow[];
	layouts: ReadonlyMap<string, PaneLayoutSnapshot | null>;
}): SnapshotWorkspace[] {
	const agentByTerminal = new Map(agents.map((row) => [row.terminalId, row]));
	return workspaces.map((workspace) => ({
		id: workspace.id,
		name: workspace.name,
		project: workspace.projectName ?? null,
		branch: workspace.branch ?? null,
		terminals: terminals
			.filter((terminal) => terminal.workspaceId === workspace.id)
			.map((terminal) => {
				const agent = agentByTerminal.get(terminal.terminalId);
				return {
					id: terminal.terminalId,
					title: terminal.title,
					agent: agent
						? { id: agent.agentId, state: agentRunState(agent.lastEventType) }
						: null,
				};
			}),
		layout: layouts.get(workspace.id) ?? null,
	}));
}

export function formatSnapshot(workspaces: SnapshotWorkspace[]): string {
	if (workspaces.length === 0) return "No workspaces on this host.";
	return workspaces
		.map((workspace) => {
			const heading = [
				[workspace.project, workspace.name].filter(Boolean).join(" / "),
				workspace.branch ? `[${workspace.branch}]` : null,
				workspace.id,
			]
				.filter(Boolean)
				.join("  ");
			const terminals = workspace.terminals.length
				? workspace.terminals.map((terminal) =>
						[
							`  terminal ${terminal.id}`,
							terminal.title ? `"${terminal.title}"` : null,
							terminal.agent
								? `${terminal.agent.id} · ${terminal.agent.state}`
								: null,
						]
							.filter(Boolean)
							.join("  "),
					)
				: ["  no live terminals"];
			const layout = workspace.layout
				? formatLayout(workspace.layout)
						.split("\n")
						.map((line) => `  ${line}`)
				: [];
			return [heading, ...terminals, ...layout].join("\n");
		})
		.join("\n\n");
}
