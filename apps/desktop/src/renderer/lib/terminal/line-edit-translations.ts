export interface LineEditChordOptions {
	isMac: boolean;
	isWindows: boolean;
	/**
	 * True when xterm.js's kitty keyboard mode is active (a TUI has pushed
	 * flags via `CSI > Ps u`). When active, Enter chords skip translation so
	 * xterm's native CSI-u encoder reaches the TUI — kitty-aware programs
	 * (Codex, etc.) decode `\x1B[13;Nu` as the proper Shift/Cmd+Enter event,
	 * whereas our `\x1B\r` shim is silently dropped.
	 */
	kittyKeyboardActive: boolean;
}

type Platform = "mac" | "windows" | "linux";

interface Chord {
	key: string;
	shift?: boolean;
	meta?: boolean;
	alt?: boolean;
	ctrl?: boolean;
}

interface ChordTranslation {
	chord: Chord;
	sequence: string;
	/** Omit to match all platforms. */
	platforms?: Platform[];
	/**
	 * Skip when xterm's kitty keyboard mode is active. Used for Enter chords
	 * whose `\x1B\r` shim conflicts with the kitty CSI-u encoding the TUI
	 * actually expects.
	 */
	skipWhenKittyActive?: boolean;
}

const TRANSLATIONS: ChordTranslation[] = [
	// Shift+Enter and Mac Cmd+Enter emit ESC+CR for chat TUIs that don't push
	// the kitty keyboard protocol (Claude Code reads `\x1B\r` as Shift+Enter
	// via readline). When a TUI HAS pushed kitty mode, xterm.js will encode
	// these as CSI-u natively (`\x1B[13;Nu`) — skip our shim so the TUI sees
	// the proper sequence.
	{
		chord: { key: "Enter", shift: true },
		sequence: "\x1b\r",
		skipWhenKittyActive: true,
	},
	{
		chord: { key: "Enter", meta: true },
		sequence: "\x1b\r",
		platforms: ["mac"],
		skipWhenKittyActive: true,
	},
	// Mac Cmd+ line edit
	{
		chord: { key: "Backspace", meta: true },
		sequence: "\x15\x1b[D",
		platforms: ["mac"],
	},
	{
		chord: { key: "ArrowLeft", meta: true },
		sequence: "\x01",
		platforms: ["mac"],
	},
	{
		chord: { key: "ArrowRight", meta: true },
		sequence: "\x05",
		platforms: ["mac"],
	},
	// Mac Option+ word jump
	{
		chord: { key: "ArrowLeft", alt: true },
		sequence: "\x1bb",
		platforms: ["mac"],
	},
	{
		chord: { key: "ArrowRight", alt: true },
		sequence: "\x1bf",
		platforms: ["mac"],
	},
	// Windows Ctrl+ word jump
	{
		chord: { key: "ArrowLeft", ctrl: true },
		sequence: "\x1bb",
		platforms: ["windows"],
	},
	{
		chord: { key: "ArrowRight", ctrl: true },
		sequence: "\x1bf",
		platforms: ["windows"],
	},
];

function matchesChord(event: KeyboardEvent, chord: Chord): boolean {
	return (
		event.key === chord.key &&
		event.shiftKey === !!chord.shift &&
		event.metaKey === !!chord.meta &&
		event.altKey === !!chord.alt &&
		event.ctrlKey === !!chord.ctrl
	);
}

function matchesPlatform(
	platforms: Platform[] | undefined,
	options: LineEditChordOptions,
): boolean {
	if (!platforms) return true;
	if (options.isMac) return platforms.includes("mac");
	if (options.isWindows) return platforms.includes("windows");
	return platforms.includes("linux");
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
	for (const t of TRANSLATIONS) {
		if (t.skipWhenKittyActive && options.kittyKeyboardActive) continue;
		if (matchesPlatform(t.platforms, options) && matchesChord(event, t.chord)) {
			return t.sequence;
		}
	}
	return null;
}
