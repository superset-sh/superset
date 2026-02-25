/**
 * Defers opening the delete dialog to the next macrotask.
 * This avoids a focus race with Radix ContextMenu focus restoration.
 */
export function deferDeleteDialogOpen(
	setShowDeleteDialog: (show: boolean) => void,
) {
	return setTimeout(() => {
		setShowDeleteDialog(true);
	}, 0);
}
