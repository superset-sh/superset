export interface LineEditChordOptions {
	isMac: boolean;
	isWindows: boolean;
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
}

const TRANSLATIONS: ChordTranslation[] = [
	// Shift+Enter and Mac Cmd+Enter both emit ESC+CR — chat TUIs (Claude Code,
	// etc.) parse this as a newline. Sent directly because xterm's kitty
	// keyboard encoder would otherwise produce CSI-u sequences the TUI doesn't
	// recognize.
	{ chord: { key: "Enter", shift: true }, sequence: "\x1b\r" },
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
	{
		chord: { key: "Enter", meta: true },
		sequence: "\x1b\r",
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
		if (matchesPlatform(t.platforms, options) && matchesChord(event, t.chord)) {
			return t.sequence;
		}
	}
	return null;
}
