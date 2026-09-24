import type { TerminalAgentBinding } from "./types.ts";

export function matchesAgentBinding(
	current: TerminalAgentBinding | undefined,
	expected: TerminalAgentBinding,
): boolean {
	return (
		current !== undefined &&
		current.endedAt === undefined &&
		current.terminalId === expected.terminalId &&
		current.workspaceId === expected.workspaceId &&
		current.agentId === expected.agentId &&
		(expected.launchId !== undefined
			? current.launchId === expected.launchId
			: current.startedAt === expected.startedAt) &&
		(expected.agentSessionId === undefined ||
			current.agentSessionId === expected.agentSessionId)
	);
}
