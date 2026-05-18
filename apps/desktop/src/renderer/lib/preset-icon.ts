import type { HostAgentConfig } from "@superset/host-service/settings";
import { getPresetIcon } from "renderer/assets/app-icons/preset-icons";

interface PresetWithAgent {
	agentId?: string;
}

/**
 * Resolves the preset-icon key for a v2 terminal preset.
 *
 * v2 preset rows store the linked host-agent config id in `agentId` (a UUID),
 * not the icon key. The icon key lives on the agent as `presetId`
 * (e.g. `"cursor-agent"`), so the canonical resolution is
 * `agentId → agent → agent.presetId → icon`. Falls back to `agentId` itself
 * for legacy v2 rows whose `agentId` still holds a presetId.
 *
 * Never resolve by `preset.name` — it's user-editable display text and would
 * silently break for any label with spaces, casing differences, or edits.
 */
export function resolveV2PresetIcon(
	preset: PresetWithAgent,
	agents: HostAgentConfig[] | undefined,
	isDark: boolean,
): string | undefined {
	if (!preset.agentId) return undefined;
	const linkedAgentPresetId =
		agents?.find((agent) => agent.id === preset.agentId)?.presetId ??
		agents?.find((agent) => agent.presetId === preset.agentId)?.presetId;
	return (
		(linkedAgentPresetId
			? getPresetIcon(linkedAgentPresetId, isDark)
			: undefined) ?? getPresetIcon(preset.agentId, isDark)
	);
}
