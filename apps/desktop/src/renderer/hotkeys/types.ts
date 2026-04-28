export type Platform = "mac" | "windows" | "linux";

export type PlatformKey = {
	mac: string | null;
	windows: string | null;
	linux: string | null;
};

export type HotkeyCategory =
	| "Navigation"
	| "Workspace"
	| "Layout"
	| "Terminal"
	| "Window"
	| "Help";

export interface HotkeyDisplay {
	/** Individual symbols for <Kbd> components: ["⌘", "⇧", "N"] */
	keys: string[];
	/** Joined string for tooltip text: "⌘⇧N" (mac) or "Ctrl+Shift+N" (windows/linux) */
	text: string;
}

export interface HotkeyDefinition {
	key: string | null;
	label: string;
	category: HotkeyCategory;
	description?: string;
}

/**
 * How a binding identifies a key:
 *
 * - `physical`: matches by `event.code` (the QWERTY-`P` slot is `KeyP` on
 *   every layout). Today's default for shipped registry entries — preserves
 *   muscle memory for users who learned the QWERTY layout.
 * - `logical`: matches by produced character (`event.key`). On Dvorak, the
 *   physical R-position prints "p" — a logical `meta+p` binding fires when
 *   the user presses the key labeled P, regardless of layout. Default for
 *   new user-recorded printable bindings.
 * - `named`: matches by the named-key event.code (Enter, Escape, ArrowUp,
 *   F1-F12, Backspace, etc.). These are stable across layouts and aren't
 *   really physical *or* logical — they have a name that the OS reports
 *   identically regardless of layout. Recorder uses this automatically for
 *   non-printable keys.
 */
export type BindingMode = "physical" | "logical" | "named";

/**
 * Versioned shape for a single hotkey binding.
 *
 * Stored in localStorage as either a bare chord string (legacy / shipped
 * defaults — implicitly `physical`) or a v2 object. The legacy string form
 * is preserved indefinitely so default registry entries stay terse.
 */
export type ShortcutBinding =
	| string // legacy / shipped default — treated as { mode: "physical" }
	| {
			version: 2;
			mode: BindingMode;
			/** Same canonical form as legacy strings: "meta+shift+p", "ctrl+slash". */
			chord: string;
	  };

/** Normalized view of a binding, regardless of stored form. */
export interface ParsedBinding {
	mode: BindingMode;
	chord: string;
}
