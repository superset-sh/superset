import type { TerminalPreset } from "@superset/local-db";
import {
	AGENT_LABELS,
	AGENT_TYPES,
	type AgentType,
} from "@superset/shared/agent-command";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

const BUILTIN_AGENT_IDS = new Set<string>(AGENT_TYPES);

export interface AgentConfigLike {
	id: string;
	presetId: string;
}

export interface V2PresetLike {
	name: string;
	agentId?: string | null;
}

export interface ResolvedPresetImport {
	v2Name: string;
	linkedAgentId: string | undefined;
	/** Keep-v2 collision policy: an existing v2 preset by agentId/name wins. */
	alreadyImported: boolean;
}

export function resolvePresetImport(
	preset: Pick<TerminalPreset, "name">,
	agents: AgentConfigLike[],
	v2Presets: V2PresetLike[],
): ResolvedPresetImport {
	const importedAgentIds = new Set(
		v2Presets.flatMap((p) => (p.agentId ? [p.agentId] : [])),
	);
	const importedNames = new Set(
		v2Presets.flatMap((p) => (p.agentId ? [] : [p.name])),
	);

	const agentConfigIdByPresetId = new Map<AgentType, string>();
	for (const agent of agents) {
		if (!BUILTIN_AGENT_IDS.has(agent.presetId)) continue;
		const presetId = agent.presetId as AgentType;
		if (agentConfigIdByPresetId.has(presetId)) continue;
		agentConfigIdByPresetId.set(presetId, agent.id);
	}

	const builtInAgentId = BUILTIN_AGENT_IDS.has(preset.name)
		? (preset.name as AgentType)
		: undefined;
	const linkedAgentId = builtInAgentId
		? (agentConfigIdByPresetId.get(builtInAgentId) ?? builtInAgentId)
		: undefined;
	const v2Name = builtInAgentId ? AGENT_LABELS[builtInAgentId] : preset.name;
	const alreadyImported = linkedAgentId
		? importedAgentIds.has(linkedAgentId) ||
			(!!builtInAgentId && importedAgentIds.has(builtInAgentId))
		: importedNames.has(v2Name);

	return { v2Name, linkedAgentId, alreadyImported };
}

export function buildV2TerminalPresetRow(
	preset: TerminalPreset,
	tabOrder: number,
	resolved: Pick<ResolvedPresetImport, "v2Name" | "linkedAgentId">,
): V2TerminalPresetRow {
	return {
		id: crypto.randomUUID(),
		name: resolved.v2Name,
		description: preset.description,
		cwd: preset.cwd,
		commands: preset.commands,
		projectIds: preset.projectIds ?? null,
		pinnedToBar: preset.pinnedToBar,
		applyOnWorkspaceCreated: preset.applyOnWorkspaceCreated,
		applyOnNewTab: preset.applyOnNewTab,
		executionMode: preset.executionMode ?? "new-tab",
		tabOrder,
		createdAt: new Date(),
		agentId: resolved.linkedAgentId,
	};
}
