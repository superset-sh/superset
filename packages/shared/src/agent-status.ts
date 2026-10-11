// Ordered by urgency, least first. `failed` sits just below `permission`:
// both demand attention, but a live permission prompt is actionable right
// now, whereas a failure is terminal.
export const ACTIVE_AGENT_STATUSES = [
	"review",
	"working",
	"failed",
	"permission",
] as const;

export type ActiveAgentStatus = (typeof ACTIVE_AGENT_STATUSES)[number];

export function isActiveAgentStatus(
	value: unknown,
): value is ActiveAgentStatus {
	return (
		typeof value === "string" &&
		(ACTIVE_AGENT_STATUSES as readonly string[]).includes(value)
	);
}

export function agentStatusFromEvent(
	lastEventType: string,
): ActiveAgentStatus | null {
	switch (lastEventType) {
		case "Start":
			return "working";
		case "PermissionRequest":
			return "permission";
		case "Failed":
			return "failed";
		case "Stop":
			return "review";
		default:
			return null;
	}
}

/** An agent's turn state as scripts see it; there is no unseen "review" here. */
export type AgentRunState = "starting" | "working" | "blocked" | "idle";

/** `Attached` is the launch event, before the agent has started a turn. */
export function agentRunState(lastEventType: string): AgentRunState {
	if (lastEventType === "Attached") return "starting";
	switch (agentStatusFromEvent(lastEventType)) {
		case "working":
			return "working";
		case "permission":
			return "blocked";
		default:
			return "idle";
	}
}

export function highestAgentStatus(
	statuses: Iterable<ActiveAgentStatus | null | undefined>,
): ActiveAgentStatus | null {
	let highest: ActiveAgentStatus | null = null;
	for (const status of statuses) {
		if (!status) continue;
		if (
			highest === null ||
			ACTIVE_AGENT_STATUSES.indexOf(status) >
				ACTIVE_AGENT_STATUSES.indexOf(highest)
		) {
			highest = status;
		}
	}
	return highest;
}
