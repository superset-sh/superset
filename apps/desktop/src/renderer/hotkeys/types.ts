export type Platform = "mac" | "windows" | "linux";

export type PlatformKey = {
	mac: ShortcutBinding | null;
	windows: ShortcutBinding | null;
	linux: ShortcutBinding | null;
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
	key: ShortcutBinding | null;
	label: string;
	category: HotkeyCategory;
	description?: string;
}

/**
 * How a binding identifies a key:
 * - `logical`: matches the produced character — same printed letter on
 *   every layout, even when it lives on different physical keys. Default
 *   for shipped registry entries (`⌘Z` always fires on the labeled-Z
 *   key) and for new user-recorded printable bindings, when adaptive
 *   layout mapping is enabled.
 * - `physical`: matches `event.code` — same physical key on every
 *   layout regardless of what's printed on it. Used when adaptive
 *   layout mapping is off, or for explicit position-anchored bindings.
 * - `named`: stable named keys (Enter, ArrowUp, F1-F12, ...). Used
 *   automatically for non-printable keys regardless of preference.
 */
export type BindingMode = "physical" | "logical" | "named";

/**
 * Stored as a bare chord string for legacy storage (implicitly physical
 * or named, decided by `defaultModeForChord`) or a v2 object for explicit
 * modes. Shipped defaults use the v2 object form for printable chords —
 * see the `L()` helper in `registry.ts`.
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
