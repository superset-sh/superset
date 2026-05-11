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
 * A keyboard shortcut, e.g. `"meta+shift+p"`. `null` means explicitly unassigned.
 *
 * Storage: bare chord string. (Older builds wrote `{ version: 2, mode, chord }`
 * objects; `hotkeyOverridesStore` migrates those to bare strings on hydrate.)
 */
export type ShortcutBinding = string;
