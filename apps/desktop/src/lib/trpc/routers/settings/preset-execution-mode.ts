import {
	normalizeExecutionMode,
	type TerminalPreset,
} from "@superset/local-db/schema/zod";
import { normalizePresetProjectIds } from "shared/preset-project-targeting";

export type PresetWithUnknownMode = Omit<
	TerminalPreset,
	"executionMode" | "projectIds"
> & {
	executionMode?: unknown;
	projectIds?: string[] | null;
	isDefault?: unknown;
};

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
			preset.executionMode !== normalizeExecutionMode(preset.executionMode) ||
			JSON.stringify(preset.projectIds ?? null) !==
				JSON.stringify(normalizePresetProjectIds(preset.projectIds)) ||
			preset.isDefault !== undefined,
	);
}
