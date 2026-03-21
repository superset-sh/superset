/**
 * Pure function to find the next or previous workspace needing attention
 * relative to the current workspace, cycling through attention workspaces
 * in visual sidebar order.
 *
 * @param allWorkspaceIds - All workspace IDs in visual sidebar order
 * @param attentionIds - Subset of workspace IDs that need attention, in visual order
 * @param currentWorkspaceId - The currently active workspace ID
 * @param direction - "next" or "prev"
 * @returns The target workspace ID, or null if no workspaces need attention
 */
export function findNextAttentionWorkspace(
	allWorkspaceIds: string[],
	attentionIds: string[],
	currentWorkspaceId: string,
	direction: "next" | "prev",
): string | null {
	if (attentionIds.length === 0) return null;

	const currentAttentionIndex = attentionIds.indexOf(currentWorkspaceId);

	if (currentAttentionIndex === -1) {
		// Current workspace doesn't need attention — find the closest one in the given direction
		const currentVisualIndex = allWorkspaceIds.indexOf(currentWorkspaceId);

		if (direction === "next") {
			const afterCurrent = attentionIds.find(
				(id) => allWorkspaceIds.indexOf(id) > currentVisualIndex,
			);
			return afterCurrent ?? attentionIds[0];
		}

		const beforeCurrent = [...attentionIds]
			.reverse()
			.find((id) => allWorkspaceIds.indexOf(id) < currentVisualIndex);
		return beforeCurrent ?? attentionIds[attentionIds.length - 1];
	}

	if (direction === "next") {
		return attentionIds[(currentAttentionIndex + 1) % attentionIds.length];
	}

	return attentionIds[
		(currentAttentionIndex - 1 + attentionIds.length) % attentionIds.length
	];
}
