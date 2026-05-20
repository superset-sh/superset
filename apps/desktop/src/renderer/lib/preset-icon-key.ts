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

function singlePresetId(ids: Iterable<string | undefined>): string | undefined {
	const uniqueIds = new Set<string>();
	for (const id of ids) {
		const trimmed = id?.trim();
		if (trimmed) uniqueIds.add(trimmed);
	}
	return uniqueIds.size === 1 ? uniqueIds.values().next().value : undefined;
}

function getLinkedPresetId(
	preset: PresetIconSource,
	agents: HostAgentConfig[] | undefined,
): string | undefined {
	const agentId = preset.agentId?.trim();
	if (!agentId) return undefined;

	const linkedAgentPresetId =
		agents?.find((agent) => agent.id === agentId)?.presetId ??
		agents?.find((agent) => agent.presetId === agentId)?.presetId;
	if (linkedAgentPresetId) return linkedAgentPresetId;

	const normalizedAgentId = agentId.toLowerCase();
	return BUILTIN_PRESET_IDS.has(normalizedAgentId)
		? normalizedAgentId
		: undefined;
}

function getPresetIdFromExecutable(
	executable: string,
	agents: HostAgentConfig[] | undefined,
): string | undefined {
	const agentPresetId = singlePresetId(
		(agents ?? [])
			.filter((agent) => getExecutableName(agent.command) === executable)
			.map((agent) => agent.presetId),
	);
	if (agentPresetId) return agentPresetId;

	return singlePresetId(
		HOST_AGENT_PRESETS.filter(
			(preset) => getExecutableName(preset.command) === executable,
		).map((preset) => preset.presetId),
	);
}

function getCommandPresetId(
	preset: PresetIconSource,
	agents: HostAgentConfig[] | undefined,
): string | undefined {
	const presetIds = new Set<string>();
	for (const command of preset.commands ?? []) {
		const executable = getExecutableName(command);
		if (!executable) continue;
		const presetId = getPresetIdFromExecutable(executable, agents);
		if (presetId) presetIds.add(presetId);
	}
	return presetIds.size === 1 ? presetIds.values().next().value : undefined;
}

export function resolveV2PresetIconKey(
	preset: PresetIconSource,
	agents: HostAgentConfig[] | undefined,
): string | undefined {
	return (
		getLinkedPresetId(preset, agents) ?? getCommandPresetId(preset, agents)
	);
}
