interface AgentSelectionState {
	isFetched: boolean;
	selectableAgentIds: readonly string[];
	selectedAgent: string;
}

export function getAgentSelectionBlocker({
	isFetched,
	selectableAgentIds,
	selectedAgent,
}: AgentSelectionState): string | null {
	if (!isFetched) return "Loading agents";
	if (selectableAgentIds.length === 0) return "No agents available";
	if (!selectableAgentIds.includes(selectedAgent)) return "Select an agent";
	return null;
}
