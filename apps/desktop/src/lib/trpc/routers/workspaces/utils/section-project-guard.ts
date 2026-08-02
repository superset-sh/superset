/** Guards that a target section exists and belongs to the given project. */
export function assertSectionMatchesProject(
	section: { id: string; projectId: string } | undefined,
	projectId: string,
): void {
	if (!section) {
		throw new Error("Target section not found");
	}
	if (section.projectId !== projectId) {
		throw new Error("Section does not belong to the selected project");
	}
}
