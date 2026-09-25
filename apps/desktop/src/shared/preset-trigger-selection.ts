import {
	filterMatchingPresetsForProject,
	isProjectTargetedPreset,
} from "./preset-project-targeting";

type AutoApplyField = "applyOnWorkspaceCreated" | "applyOnNewTab";

interface AutoApplyPresetLike {
	projectIds?: string[] | null;
	applyOnWorkspaceCreated?: boolean;
	applyOnNewTab?: boolean;
}

/**
 * Presets tagged with `field` for a project. Presets targeted at the project
 * win outright; all-project presets only apply when no targeted preset is
 * tagged. Shared by the v1 settings router and the v2 renderer so both
 * triggers resolve the same way on both surfaces.
 */
export function getPresetsForTriggerField<T extends AutoApplyPresetLike>(
	presets: readonly T[],
	field: AutoApplyField,
	projectId?: string | null,
): T[] {
	const matchingPresets = filterMatchingPresetsForProject(presets, projectId);
	const targetedPresets = matchingPresets.filter(isProjectTargetedPreset);
	const globalPresets = matchingPresets.filter(
		(preset) => !isProjectTargetedPreset(preset),
	);

	const targetedTagged = targetedPresets.filter((preset) => preset[field]);
	if (targetedTagged.length > 0) {
		return targetedTagged;
	}

	return globalPresets.filter((preset) => preset[field]);
}
