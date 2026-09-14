/**
 * The vocabulary the Lock Screen card speaks. Hosts report transitions between
 * these states to the API, the API stores the latest per terminal and pushes
 * the card, and the phone renders it. Everything richer stays on the host.
 */
export const AGENT_CARD_STATES = [
	"working",
	"review",
	"permission",
	"failed",
] as const;

export type AgentCardState = (typeof AGENT_CARD_STATES)[number];

/** A reported state, or `gone` when the terminal leaves the card. */
export type AgentStatusState = AgentCardState | "gone";

export interface AgentStatusTransition {
	terminalId: string;
	workspaceId: string;
	workspaceName: string;
	projectId?: string;
	projectName?: string;
	state: AgentStatusState;
	/** When the terminal entered this state, epoch milliseconds. */
	sinceAt: number;
}

export interface AgentStatusReport {
	machineId: string;
	terminals: AgentStatusTransition[];
}

/**
 * Row order for the card, most urgent first. Deliberately not the desktop's
 * priority, which ranks working above review: on a glanceable card the
 * question is "what wants me?", and a finished session waiting to be read
 * wants you more than a busy one that does not.
 */
export const AGENT_CARD_PRIORITY: Record<AgentCardState, number> = {
	permission: 4,
	failed: 3,
	review: 2,
	working: 1,
};

/**
 * The host's lifecycle event names (`Start`, `Stop`, `PermissionRequest`,
 * `Failed`, `Attached`, `Detached`) folded into the card's four states.
 * `Attached` and `Detached` say nothing about what the agent wants.
 */
export function agentCardStateFromEvent(
	lastEventType: string,
): AgentCardState | null {
	switch (lastEventType) {
		case "PermissionRequest":
			return "permission";
		case "Start":
			return "working";
		case "Failed":
			return "failed";
		case "Stop":
			return "review";
		default:
			return null;
	}
}
