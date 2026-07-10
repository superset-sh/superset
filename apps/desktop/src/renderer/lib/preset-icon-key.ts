import type { HostAgentConfig } from "@superset/host-service/settings";
import { HOST_AGENT_PRESETS } from "@superset/shared/host-agent-presets";
import { parseCommandString } from "./argv";

export interface PresetIconSource {
	agentId?: string;
	commands?: readonly string[];
}

const BUILTIN_PRESET_IDS: ReadonlySet<string> = new Set(
	HOST_AGENT_PRESETS.map((preset) => preset.presetId),
);

function getExecutableName(command: string): string | undefined {
	let parsed: ReturnType<typeof parseCommandString>;
	try {
		parsed = parseCommandString(command.trim());
	} catch {
		return undefined;
	}
	const executable = parsed.command.trim();
	if (!executable) return undefined;
	const normalizedPath = executable.replaceAll("\\", "/");
	const segments = normalizedPath.split("/");
	return segments.at(-1)?.toLowerCase();
}

function singleValue(values: Iterable<string | undefined>): string | undefined {
	const uniqueIds = new Set<string>();
	for (const value of values) {
		const trimmed = value?.trim();
		if (trimmed) uniqueIds.add(trimmed);
	}
	return uniqueIds.size === 1 ? uniqueIds.values().next().value : undefined;
}

function getLinkedIconKey(
	preset: PresetIconSource,
	agents: HostAgentConfig[] | undefined,
): string | undefined {
	const agentId = preset.agentId?.trim();
	if (!agentId) return undefined;

	const linkedAgent = agents?.find((agent) => agent.id === agentId);
	if (linkedAgent) return linkedAgent.iconId ?? linkedAgent.presetId;

	const normalizedAgentId = agentId.toLowerCase();
	return BUILTIN_PRESET_IDS.has(normalizedAgentId)
		? normalizedAgentId
		: undefined;
}

function getIconKeyFromExecutable(
	executable: string,
	agents: HostAgentConfig[] | undefined,
): string | undefined {
	const matchingAgents = (agents ?? []).filter(
		(agent) => getExecutableName(agent.command) === executable,
	);
	const agentIconKey = singleValue(
		matchingAgents.map((agent) => agent.iconId ?? agent.presetId),
	);
	if (agentIconKey) return agentIconKey;

	const agentPresetId = singleValue(
		matchingAgents.map((agent) => agent.presetId),
	);
	if (agentPresetId) return agentPresetId;

	return singleValue(
		HOST_AGENT_PRESETS.filter(
			(preset) => getExecutableName(preset.command) === executable,
		).map((preset) => preset.presetId),
	);
}

function getCommandIconKey(
	preset: PresetIconSource,
	agents: HostAgentConfig[] | undefined,
): string | undefined {
	const iconKeys = new Set<string>();
	for (const command of preset.commands ?? []) {
		const executable = getExecutableName(command);
		if (!executable) continue;
		const iconKey = getIconKeyFromExecutable(executable, agents);
		if (iconKey) iconKeys.add(iconKey);
	}
	return iconKeys.size === 1 ? iconKeys.values().next().value : undefined;
}

export function resolveV2PresetIconKey(
	preset: PresetIconSource,
	agents: HostAgentConfig[] | undefined,
): string | undefined {
	return getLinkedIconKey(preset, agents) ?? getCommandIconKey(preset, agents);
}
