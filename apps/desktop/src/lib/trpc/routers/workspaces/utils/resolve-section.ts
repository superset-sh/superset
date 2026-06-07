interface SectionRow {
	id: string;
	projectId: string;
}

/**
 * Validates a requested section for a new workspace and returns the
 * `sectionId` to persist (or `null` when no section was requested).
 *
 * A workspace may only be created into a section that exists and belongs to
 * the same project, mirroring the checks in `moveWorkspaceToSection`. This is
 * a pure helper so the validation can be unit-tested without a database; the
 * caller is responsible for loading the section row.
 */
export function resolveWorkspaceSectionId({
	requestedSectionId,
	section,
	projectId,
}: {
	requestedSectionId: string | null | undefined;
	section: SectionRow | undefined;
	projectId: string;
}): string | null {
	if (!requestedSectionId) {
		return null;
	}

	if (!section) {
		throw new Error(`Section "${requestedSectionId}" not found`);
	}

	if (section.projectId !== projectId) {
		throw new Error(
			"Cannot create a workspace in a section from a different project",
		);
	}

	return requestedSectionId;
}
