import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { normalizePresetProjectIds } from "shared/preset-project-targeting";

export interface PresetProjectOption {
	id: string;
	name: string;
	color: string;
	mainRepoPath: string;
}

export function resolveSelectedPresetProjects(
	projectIds: readonly string[] | null | undefined,
	projectOptionsById: ReadonlyMap<string, PresetProjectOption>,
): PresetProjectOption[] {
	const normalizedProjectIds = normalizePresetProjectIds(projectIds);
	if (normalizedProjectIds === null) {
		return [];
	}

	return normalizedProjectIds.flatMap((projectId) => {
		const project = projectOptionsById.get(projectId);
		return project ? [project] : [];
	});
}

export function getPresetProjectTargetLabel(
	projectIds: readonly string[] | null | undefined,
	projectOptionsById: ReadonlyMap<string, PresetProjectOption>,
): string {
	const normalizedProjectIds = normalizePresetProjectIds(projectIds);
	if (normalizedProjectIds === null) {
		return i18n._(
			msg({
				message: "All projects",
			}),
		);
	}

	const selectedProjects = resolveSelectedPresetProjects(
		normalizedProjectIds,
		projectOptionsById,
	);
	if (normalizedProjectIds.length === 1) {
		return (
			selectedProjects[0]?.name ??
			i18n._(
				msg({
					message: "Unknown project",
				}),
			)
		);
	}

	return i18n._(
		msg({
			message: `${normalizedProjectIds.length} projects`,
		}),
	);
}
