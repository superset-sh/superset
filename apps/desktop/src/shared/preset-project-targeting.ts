interface ProjectTargetedPresetLike {
	projectIds?: string[] | null;
}

export function normalizePresetProjectIds(
	projectIds: readonly string[] | null | undefined,
): string[] | null {
	if (!projectIds) {
		return null;
	}

	const normalized = [...new Set(projectIds.map((id) => id.trim()))].filter(
		Boolean,
	);

	return normalized.length > 0 ? normalized : null;
}

export function isProjectTargetedPreset(
	preset: ProjectTargetedPresetLike,
): boolean {
	return normalizePresetProjectIds(preset.projectIds) !== null;
}

export function presetMatchesProjectId(
	preset: ProjectTargetedPresetLike,
	projectId: string | null | undefined,
): boolean {
	const normalizedProjectIds = normalizePresetProjectIds(preset.projectIds);

	if (normalizedProjectIds === null) {
		return true;
	}

	if (!projectId) {
		return false;
	}

	return normalizedProjectIds.includes(projectId);
}

export function filterMatchingPresetsForProject<
	T extends ProjectTargetedPresetLike,
>(presets: readonly T[], projectId: string | null | undefined): T[] {
	const targeted: T[] = [];
	const global: T[] = [];

	for (const preset of presets) {
		if (!presetMatchesProjectId(preset, projectId)) {
			continue;
		}

		if (isProjectTargetedPreset(preset)) {
			targeted.push(preset);
			continue;
		}

		global.push(preset);
	}

	return [...targeted, ...global];
}
