import type { TerminalPreset } from "@superset/local-db";
import {
	filterMatchingPresetsForProject,
	isProjectTargetedPreset,
} from "shared/preset-project-targeting";

type AutoApplyField = "applyOnWorkspaceCreated" | "applyOnNewTab";

export function getPresetsForTriggerField(
	presets: readonly TerminalPreset[],
	field: AutoApplyField,
	projectId?: string | null,
): TerminalPreset[] {
	const matchingPresets = filterMatchingPresetsForProject(presets, projectId);
	const targetedPresets = matchingPresets.filter(isProjectTargetedPreset);
	const globalPresets = matchingPresets.filter(
		(preset) => !isProjectTargetedPreset(preset),
	);

	const targetedTagged = targetedPresets.filter((preset) => preset[field]);
	if (targetedTagged.length > 0) {
		return targetedTagged;
	}

	const globalTagged = globalPresets.filter((preset) => preset[field]);
	if (globalTagged.length > 0) {
		return globalTagged;
	}

	return [];
}
