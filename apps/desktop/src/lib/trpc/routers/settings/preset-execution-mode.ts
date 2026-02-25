import {
	normalizeExecutionMode,
	type TerminalPreset,
} from "@superset/local-db";

export type PresetWithUnknownMode = Omit<TerminalPreset, "executionMode"> & {
	executionMode?: unknown;
};

export function normalizeTerminalPreset(
	preset: PresetWithUnknownMode,
): TerminalPreset {
	return {
		...preset,
		executionMode: normalizeExecutionMode(preset.executionMode),
	};
}

export function normalizeTerminalPresets(
	presets: PresetWithUnknownMode[],
): TerminalPreset[] {
	return presets.map(normalizeTerminalPreset);
}

export function shouldPersistNormalizedPresetModes(
	presets: PresetWithUnknownMode[],
): boolean {
	return presets.some(
		(preset) =>
			preset.executionMode !== normalizeExecutionMode(preset.executionMode),
	);
}
