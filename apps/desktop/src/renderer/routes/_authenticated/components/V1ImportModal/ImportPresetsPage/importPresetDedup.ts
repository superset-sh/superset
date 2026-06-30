import type { HostAgentConfig } from "@superset/host-service/settings";
import {
	AGENT_LABELS,
	AGENT_TYPES,
	type AgentType,
} from "@superset/shared/agent-command";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

const BUILTIN_AGENT_IDS = new Set<string>(AGENT_TYPES);

/**
 * Map each builtin agent type to the *current* host-service agent config id.
 * The first config wins when duplicates of the same preset exist.
 */
export function buildAgentConfigIdByPresetId(
	agents: readonly HostAgentConfig[],
): Map<AgentType, string> {
	const map = new Map<AgentType, string>();
	for (const agent of agents) {
		if (!BUILTIN_AGENT_IDS.has(agent.presetId)) continue;
		const presetId = agent.presetId as AgentType;
		if (map.has(presetId)) continue;
		map.set(presetId, agent.id);
	}
	return map;
}

export interface ImportedPresetIndex {
	/** Agent config ids referenced by already-imported v2 presets. */
	importedAgentIds: Set<string>;
	/** Names of already-imported v2 presets that have *no* linked agent id. */
	importedNames: Set<string>;
	/** Names of *all* already-imported v2 presets, linked or not. */
	importedNamesAll: Set<string>;
}

export function buildImportedPresetIndex(
	v2Presets: readonly V2TerminalPresetRow[],
): ImportedPresetIndex {
	return {
		importedAgentIds: new Set(
			v2Presets.flatMap((p) => (p.agentId ? [p.agentId] : [])),
		),
		importedNames: new Set(
			v2Presets.flatMap((p) => (p.agentId ? [] : [p.name])),
		),
		importedNamesAll: new Set(v2Presets.map((p) => p.name)),
	};
}

export interface ResolvedPresetImport {
	/** Host-service agent config id this v1 preset should live-link to. */
	linkedAgentId: string | undefined;
	/** Display name the imported v2 preset will use. */
	v2Name: string;
	/** Whether an equivalent v2 preset already exists. */
	alreadyImported: boolean;
}

/**
 * Decide how a single v1 terminal preset maps into v2 and whether it has
 * already been imported. Pure so the import wizard's dedup is unit-testable.
 */
export function resolvePresetImport({
	presetName,
	agentConfigIdByPresetId,
	index,
}: {
	presetName: string;
	agentConfigIdByPresetId: Map<AgentType, string>;
	index: ImportedPresetIndex;
}): ResolvedPresetImport {
	const builtInAgentId = BUILTIN_AGENT_IDS.has(presetName)
		? (presetName as AgentType)
		: undefined;
	const linkedAgentId = builtInAgentId
		? (agentConfigIdByPresetId.get(builtInAgentId) ?? builtInAgentId)
		: undefined;
	const v2Name = builtInAgentId ? AGENT_LABELS[builtInAgentId] : presetName;
	const alreadyImported = linkedAgentId
		? index.importedAgentIds.has(linkedAgentId) ||
			(!!builtInAgentId && index.importedAgentIds.has(builtInAgentId)) ||
			// The linked agent config id is a random UUID re-minted whenever the
			// host re-seeds its agent table (e.g. after an upgrade), so it can't
			// be relied on as a stable identity. Fall back to the canonical
			// builtin name, which is stable across upgrades, to avoid offering an
			// already-imported builtin preset for a duplicate re-import. See #5132.
			index.importedNamesAll.has(v2Name)
		: index.importedNames.has(v2Name);
	return { linkedAgentId, v2Name, alreadyImported };
}
