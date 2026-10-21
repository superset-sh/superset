export type AgentChoice = {
	presetId: string;
	// Icon key when it differs from presetId, e.g. a configured agent keyed by its own id.
	iconId?: string;
	label: string;
	models: { id: string; label: string }[];
};

/** Other agents the chat can move to; picking one of their models hands the conversation over. */
export type AgentSwitcher = {
	currentPresetId: string;
	agents: AgentChoice[];
	onSwitch: (
		presetId: string,
		model: { id: string; label: string } | null,
	) => void;
};
