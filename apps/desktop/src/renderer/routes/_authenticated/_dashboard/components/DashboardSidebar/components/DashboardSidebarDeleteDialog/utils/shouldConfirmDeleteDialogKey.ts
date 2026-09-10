interface ConfirmDeleteDialogKeyEvent {
	key: string;
	shiftKey: boolean;
	metaKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	isComposing?: boolean;
	/** A held key must not confirm a destructive dialog. */
	repeat?: boolean;
	keyCode?: number;
}

export function shouldConfirmDeleteDialogKey(
	event: ConfirmDeleteDialogKeyEvent,
): boolean {
	if (event.isComposing || event.keyCode === 229 || event.repeat) return false;
	return (
		event.key === "Enter" &&
		!event.shiftKey &&
		!event.metaKey &&
		!event.ctrlKey &&
		!event.altKey
	);
}
