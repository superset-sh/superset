export interface StopAllAgentsConfirmCopy {
	title: string;
	description: string;
	confirmLabel: string;
}

function pluralizeAgents(count: number): string {
	return count === 1 ? "1 agent" : `${count} agents`;
}

/**
 * Accessible name of the running-agents chip. The chip only opens the card
 * listing the agents, so its label must never promise a stop — an inspect
 * target and a kill-everything target cannot be the same control.
 */
export function getAgentsChipLabel(agentCount: number): string {
	return agentCount === 1
		? "Show 1 running agent"
		: `Show ${agentCount} running agents`;
}

/**
 * Copy for the stop-all confirm. Killing an agent disposes its terminal
 * session, so the description says plainly what is lost — there is no undo and
 * no way to resume a disposed session.
 */
export function getStopAllAgentsConfirmCopy(
	agentCount: number,
): StopAllAgentsConfirmCopy {
	return {
		title:
			agentCount === 1 ? "Stop 1 agent?" : `Stop all ${agentCount} agents?`,
		description:
			"Each agent's terminal session is disposed. The processes end immediately, and their scrollback and in-progress work can't be recovered.",
		confirmLabel: `Stop ${pluralizeAgents(agentCount)}`,
	};
}
