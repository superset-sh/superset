import type { HostAgentConfig } from "@superset/host-service/settings";
import { getPresetIcon } from "renderer/assets/app-icons/preset-icons";
import {
	type PresetIconSource,
	resolveV2PresetIconKey,
} from "./preset-icon-key";

/**
 * Resolves the preset-icon key for a v2 terminal preset.
 *
 * v2 preset rows store the linked host-agent config id in `agentId` (a UUID),
 * not the icon key. The icon key lives on the agent as `iconId` when the user
 * picked a custom override, otherwise the agent falls back to `presetId`
 * (e.g. `"cursor-agent"`). The canonical resolution is
 * `agentId → agent → agent.iconId ?? agent.presetId → icon`. Falls back to
 * `agentId` itself for legacy v2 rows whose `agentId` still holds a presetId.
 *
 * If the link is missing or stale, falls back to the stored command's
 * executable for display only. Launch still uses the linked agent when present
 * and the preset's stored commands otherwise.
 *
 * Never resolve by `preset.name` — it's user-editable display text and would
 * silently break for any label with spaces, casing differences, or edits.
 */
export function resolveV2PresetIcon(
	preset: PresetIconSource,
	agents: HostAgentConfig[] | undefined,
	isDark: boolean,
): string | undefined {
	const iconKey = resolveV2PresetIconKey(preset, agents);
	return iconKey ? getPresetIcon(iconKey, isDark) : undefined;
}
