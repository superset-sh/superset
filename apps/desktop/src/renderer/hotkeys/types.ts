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
 * - `physical`: matches `event.code` — same physical key on every layout.
 *   Default for shipped registry entries (preserves QWERTY muscle memory).
 * - `logical`: matches the produced character (`event.key`) — same printed
 *   letter on every layout, even when it lives on different physical keys.
 *   Default for new user-recorded printable bindings.
 * - `named`: stable named keys (Enter, ArrowUp, F1-F12, ...). Used
 *   automatically for non-printable keys regardless of preference.
 */
export type BindingMode = "physical" | "logical" | "named";

/**
 * Stored as a bare chord string for legacy / shipped defaults (implicitly
 * physical) or a v2 object for explicit modes. The legacy string form is
 * preserved indefinitely so default registry entries stay terse.
 */
export type ShortcutBinding =
	| string
	| {
			version: 2;
			mode: BindingMode;
			/** Canonical form, e.g. "meta+shift+p", "ctrl+slash". */
			chord: string;
	  };

/** Normalized view of a binding, regardless of stored form. */
export interface ParsedBinding {
	mode: BindingMode;
	chord: string;
}
