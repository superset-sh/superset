export interface LineEditChordOptions {
	isMac: boolean;
	isWindows: boolean;
}

/** True when `mod` is the only non-shift modifier held. */
function onlyMod(event: KeyboardEvent, mod: "meta" | "alt" | "ctrl"): boolean {
	return (
		event.metaKey === (mod === "meta") &&
		event.altKey === (mod === "alt") &&
		event.ctrlKey === (mod === "ctrl") &&
		!event.shiftKey
	);
}

/**
 * Translate Mac Cmd+/Option+ and Windows Ctrl+ arrow / backspace chords into
 * the escape sequences shells expect. Returns the bytes to send, or null if
 * this chord isn't a line-edit translation.
 *
 * CONTRACT: only check `event.key` for stable named keys (Backspace,
 * ArrowLeft/Right, Home, End, ...). Never `event.key` for printable
 * characters — those vary by layout (`event.key === "p"` on QWERTY is `"r"`
 * on Dvorak) and silently break non-US users. Use `event.code` via
 * `resolveHotkeyFromEvent` for any printable-key translation.
 */
export function translateLineEditChord(
	event: KeyboardEvent,
	options: LineEditChordOptions,
): string | null {
	const { isMac, isWindows } = options;
	const { key } = event;

	if (isMac && onlyMod(event, "meta")) {
		if (key === "Backspace") return "\x15\x1b[D";
		if (key === "ArrowLeft") return "\x01";
		if (key === "ArrowRight") return "\x05";
		// Chat TUIs parse ESC+CR as Shift+Enter/newline in kitty mode.
		if (key === "Enter") return "\x1b\r";
	}
	if (isMac && onlyMod(event, "alt")) {
		if (key === "ArrowLeft") return "\x1bb";
		if (key === "ArrowRight") return "\x1bf";
	}
	if (isWindows && onlyMod(event, "ctrl")) {
		if (key === "ArrowLeft") return "\x1bb";
		if (key === "ArrowRight") return "\x1bf";
	}
	return null;
}
