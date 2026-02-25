export interface AutoFocusEventLike {
	preventDefault: () => void;
}

/**
 * Coordinates opening the delete dialog from a ContextMenu item selection.
 *
 * When "Close Worktree" is selected, we wait for ContextMenu close and then:
 * 1) prevent Radix auto-focus from returning to the trigger
 * 2) open the delete dialog
 */
export function createContextMenuDeleteDialogCoordinator(
	openDeleteDialog: () => void,
) {
	let shouldOpenDeleteDialog = false;

	return {
		requestOpenDeleteDialog() {
			shouldOpenDeleteDialog = true;
		},
		handleCloseAutoFocus(event: AutoFocusEventLike) {
			if (!shouldOpenDeleteDialog) return;
			shouldOpenDeleteDialog = false;
			event.preventDefault();
			openDeleteDialog();
		},
	};
}
