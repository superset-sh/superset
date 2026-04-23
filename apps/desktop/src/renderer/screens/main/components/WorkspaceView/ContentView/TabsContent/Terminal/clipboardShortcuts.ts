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
 * EXPERIMENT: narrow Mac rule back to just Cmd+V + Cmd+C-with-selection (the
 * original VS Code-style bubble). Test whether TERM_PROGRAM=kitty alone is
 * enough — claude-code/codex should parse CSI-u Cmd+chords correctly with the
 * TERM_PROGRAM fix, so maybe we don't need the broad Ghostty rule.
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
		if (event.code === "KeyV" && (onlyCtrl || ctrlShiftOnly)) return true;
		if (event.code === "KeyC" && ctrlShiftOnly) return true;
		if (event.code === "KeyC" && onlyCtrl && hasSelection) return true;
		return false;
	}

	return (
		(event.code === "KeyV" && ctrlShiftOnly) ||
		(event.code === "Insert" && onlyShift) ||
		(event.code === "KeyC" && ctrlShiftOnly)
	);
}
