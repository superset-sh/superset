import {
	normalizeExecutionMode,
	type TerminalPreset,
} from "@superset/local-db/schema/zod";
import { AGENT_PRESET_COMMANDS } from "@superset/shared/agent-command";
import { normalizePresetProjectIds } from "shared/preset-project-targeting";

export type PresetWithUnknownMode = Omit<
	TerminalPreset,
	"executionMode" | "projectIds"
> & {
	executionMode?: unknown;
	projectIds?: string[] | null;
	isDefault?: unknown;
};

const LEGACY_CODEX_PRESET_COMMAND =
	'codex -c model_reasoning_effort="high" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true';
const CURRENT_CODEX_PRESET_COMMAND =
	AGENT_PRESET_COMMANDS.codex[0] ?? LEGACY_CODEX_PRESET_COMMAND;

function normalizePresetCommands(commands: string[]): string[] {
	return commands.map((command) =>
		command === LEGACY_CODEX_PRESET_COMMAND
			? CURRENT_CODEX_PRESET_COMMAND
			: command,
	);
}

export function normalizeTerminalPreset(
	preset: PresetWithUnknownMode,
): TerminalPreset {
	const {
		executionMode,
		projectIds,
		isDefault,
		applyOnWorkspaceCreated,
		applyOnNewTab,
		...rest
	} = preset;
	const shouldMigrateLegacyDefault =
		isDefault === true &&
		applyOnWorkspaceCreated === undefined &&
		applyOnNewTab === undefined;

	return {
		...rest,
		commands: normalizePresetCommands(rest.commands),
		projectIds: normalizePresetProjectIds(projectIds),
		applyOnWorkspaceCreated: shouldMigrateLegacyDefault
			? true
			: applyOnWorkspaceCreated,
		applyOnNewTab: shouldMigrateLegacyDefault ? true : applyOnNewTab,
		executionMode: normalizeExecutionMode(executionMode),
	};
}

export function normalizeTerminalPresets(
	presets: PresetWithUnknownMode[],
): TerminalPreset[] {
	return presets.map(normalizeTerminalPreset);
}

export function shouldPersistNormalizedTerminalPresets(
	presets: PresetWithUnknownMode[],
): boolean {
	return presets.some(
		(preset) =>
			JSON.stringify(preset.commands) !==
				JSON.stringify(normalizePresetCommands(preset.commands)) ||
			preset.executionMode !== normalizeExecutionMode(preset.executionMode) ||
			JSON.stringify(preset.projectIds ?? null) !==
				JSON.stringify(normalizePresetProjectIds(preset.projectIds)) ||
			preset.isDefault !== undefined,
	);
}
