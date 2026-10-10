/** Whether an agent's CDP `Input.*` command is in flight for a browser pane. */
export interface AgentInputState {
	paneId: string;
	active: boolean;
}

/**
 * How long after an agent's input settles a focus change still counts as its
 * doing: the guest's reaction and the CDP reply travel on separate channels and
 * can arrive in either order.
 */
export const AGENT_INPUT_GRACE_MS = 250;
