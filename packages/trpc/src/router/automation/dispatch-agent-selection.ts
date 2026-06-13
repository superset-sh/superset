export interface HostAgentConfigSummary {
	id: string;
	presetId: string;
}

export function chooseAutomationAgentForHost(args: {
	agent: string;
	selectedHostMachineId: string;
	sourceHostId: string | null;
	targetConfigs: HostAgentConfigSummary[];
	sourceConfigs: HostAgentConfigSummary[];
}): string {
	if (args.agent === "superset") return args.agent;
	if (args.targetConfigs.some((config) => config.id === args.agent)) {
		return args.agent;
	}
	if (args.targetConfigs.some((config) => config.presetId === args.agent)) {
		return args.agent;
	}
	if (!args.sourceHostId || args.sourceHostId === args.selectedHostMachineId) {
		return args.agent;
	}

	const sourceConfig = args.sourceConfigs.find(
		(config) => config.id === args.agent,
	);
	return sourceConfig?.presetId ?? args.agent;
}
