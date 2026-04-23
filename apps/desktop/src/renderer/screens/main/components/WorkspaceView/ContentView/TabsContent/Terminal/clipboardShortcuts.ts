export interface ClipboardShortcutEvent {
	code: string;
	metaKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
}

export interface ClipboardShortcutOptions {
	isMac: boolean;
	isWindows: boolean;
	hasSelection: boolean;
}

/** Match VS Code's macOS terminal `Cmd+A` binding. */
export function shouldSelectAllShortcut(
	event: ClipboardShortcutEvent,
	isMac: boolean,
): boolean {
	return (
		isMac &&
		event.code === "KeyA" &&
		event.metaKey &&
		!event.ctrlKey &&
		!event.altKey &&
		!event.shiftKey
	);
}

/**
 * Mirror VS Code terminal clipboard bindings so host copy/paste can run before
 * xterm's kitty keyboard handler turns the chord into CSI-u input.
 */
export function shouldBubbleClipboardShortcut(
	event: ClipboardShortcutEvent,
	options: ClipboardShortcutOptions,
): boolean {
	const { isMac, isWindows, hasSelection } = options;

	const onlyMeta =
		event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
	const onlyCtrl =
		event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
	const ctrlShiftOnly =
		event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey;
	const onlyShift =
		event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;

	if (isMac && onlyMeta) {
		return event.code === "KeyV" || (hasSelection && event.code === "KeyC");
	}

	if (isWindows) {
		if (event.code === "KeyV" && (onlyCtrl || ctrlShiftOnly)) {
			return true;
		}

		if (hasSelection && event.code === "KeyC" && (onlyCtrl || ctrlShiftOnly)) {
			return true;
		}

		return false;
	}

	if (!isMac) {
		return (
			(event.code === "KeyV" && ctrlShiftOnly) ||
			(event.code === "Insert" && onlyShift) ||
			(hasSelection && event.code === "KeyC" && ctrlShiftOnly)
		);
	}

	return false;
}
