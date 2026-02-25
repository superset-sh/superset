import type { TerminalPreset } from "@superset/local-db";

export type PresetWithUnknownMode = Omit<TerminalPreset, "executionMode"> & {
	executionMode?: unknown;
};

export function normalizePresetExecutionMode(
	mode: unknown,
): "split-pane" | "new-tab" | "new-tab-split-pane" {
	if (mode === "new-tab" || mode === "new-tab-split-pane") {
		return mode;
	}
	return "split-pane";
}

export function normalizeTerminalPreset(
	preset: PresetWithUnknownMode,
): TerminalPreset {
	return {
		...preset,
		executionMode: normalizePresetExecutionMode(preset.executionMode),
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
			preset.executionMode !==
			normalizePresetExecutionMode(preset.executionMode),
	);
}
