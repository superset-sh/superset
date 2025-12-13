/**
 * Centralized hotkey definitions for the desktop app.
 * Used both for registering shortcuts and displaying in the hotkey modal.
 */

import { PLATFORM } from "./constants";

// Platform-specific modifier key symbols
const MODIFIER_MAP = PLATFORM.IS_MAC
	? { meta: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧" }
	: PLATFORM.IS_WINDOWS
		? { meta: "Win", ctrl: "Ctrl", alt: "Alt", shift: "Shift" }
		: { meta: "Super", ctrl: "Ctrl", alt: "Alt", shift: "Shift" };

const KEY_MAP: Record<string, string> = {
	...MODIFIER_MAP,
	enter: "↵",
	backspace: "⌫",
	delete: "⌦",
	escape: "⎋",
	tab: "⇥",
	up: "↑",
	down: "↓",
	left: "←",
	right: "→",
	space: "␣",
	slash: "/",
};

/** Format a key string for display (e.g., "meta+shift+d" -> ["⌘", "⇧", "D"]) */
function formatKeys(keys: string): string[] {
	return keys.split("+").map((key) => {
		const lower = key.toLowerCase();
		return KEY_MAP[lower] || key.toUpperCase();
	});
}

/** Helper to define a hotkey with pre-computed display */
function hotkey<T extends { keys: string }>(def: T): T & { display: string[] } {
	return { ...def, display: formatKeys(def.keys) };
}

export type HotkeyCategory =
	| "Workspace"
	| "Layout"
	| "Terminal"
	| "Window"
	| "Help";

interface HotkeyDefinition {
	/** Key combination for react-hotkeys-hook (e.g., "meta+s") */
	keys: string;
	/** Human-readable label for display */
	label: string;
	/** Category for grouping in the modal */
	category: HotkeyCategory;
	/** Optional description for more detail */
	description?: string;
}

/**
 * All hotkey definitions for the desktop app.
 * Keys use react-hotkeys-hook format (meta = Cmd on Mac, Ctrl on Windows/Linux)
 */
export const HOTKEYS = {
	// Workspace - switch with ⌘+1-9
	JUMP_TO_WORKSPACE_1: hotkey({
		keys: "meta+1",
		label: "Switch to Workspace 1",
		category: "Workspace",
	}),
	JUMP_TO_WORKSPACE_2: hotkey({
		keys: "meta+2",
		label: "Switch to Workspace 2",
		category: "Workspace",
	}),
	JUMP_TO_WORKSPACE_3: hotkey({
		keys: "meta+3",
		label: "Switch to Workspace 3",
		category: "Workspace",
	}),
	JUMP_TO_WORKSPACE_4: hotkey({
		keys: "meta+4",
		label: "Switch to Workspace 4",
		category: "Workspace",
	}),
	JUMP_TO_WORKSPACE_5: hotkey({
		keys: "meta+5",
		label: "Switch to Workspace 5",
		category: "Workspace",
	}),
	JUMP_TO_WORKSPACE_6: hotkey({
		keys: "meta+6",
		label: "Switch to Workspace 6",
		category: "Workspace",
	}),
	JUMP_TO_WORKSPACE_7: hotkey({
		keys: "meta+7",
		label: "Switch to Workspace 7",
		category: "Workspace",
	}),
	JUMP_TO_WORKSPACE_8: hotkey({
		keys: "meta+8",
		label: "Switch to Workspace 8",
		category: "Workspace",
	}),
	JUMP_TO_WORKSPACE_9: hotkey({
		keys: "meta+9",
		label: "Switch to Workspace 9",
		category: "Workspace",
	}),
	PREV_WORKSPACE: hotkey({
		keys: "meta+left",
		label: "Previous Workspace",
		category: "Workspace",
	}),
	NEXT_WORKSPACE: hotkey({
		keys: "meta+right",
		label: "Next Workspace",
		category: "Workspace",
	}),

	// Layout
	TOGGLE_SIDEBAR: hotkey({
		keys: "meta+b",
		label: "Toggle Sidebar",
		category: "Layout",
	}),
	SPLIT_RIGHT: hotkey({
		keys: "meta+d",
		label: "Split Right",
		category: "Layout",
		description: "Split the current pane to the right",
	}),
	SPLIT_DOWN: hotkey({
		keys: "meta+shift+d",
		label: "Split Down",
		category: "Layout",
		description: "Split the current pane downward",
	}),
	SPLIT_AUTO: hotkey({
		keys: "meta+e",
		label: "Split Pane Auto",
		category: "Layout",
		description: "Split the current pane along its longer side",
	}),

	// Terminal
	FIND_IN_TERMINAL: hotkey({
		keys: "meta+f",
		label: "Find in Terminal",
		category: "Terminal",
		description: "Search text in the active terminal",
	}),
	NEW_TERMINAL: hotkey({
		keys: "meta+t",
		label: "New Terminal",
		category: "Terminal",
	}),
	CLOSE_TERMINAL: hotkey({
		keys: "meta+w",
		label: "Close Terminal",
		category: "Terminal",
	}),
	CLEAR_TERMINAL: hotkey({
		keys: "meta+k",
		label: "Clear Terminal",
		category: "Terminal",
	}),
	PREV_TERMINAL: hotkey({
		keys: "meta+up",
		label: "Previous Terminal",
		category: "Terminal",
	}),
	NEXT_TERMINAL: hotkey({
		keys: "meta+down",
		label: "Next Terminal",
		category: "Terminal",
	}),

	// Window
	NEW_WINDOW: hotkey({
		keys: "meta+shift+n",
		label: "New Window",
		category: "Window",
	}),
	CLOSE_WINDOW: hotkey({
		keys: "meta+shift+w",
		label: "Close Window",
		category: "Window",
	}),
	OPEN_IN_APP: hotkey({
		keys: "meta+o",
		label: "Open in App",
		category: "Window",
		description: "Open workspace in external app (Cursor, VS Code, etc.)",
	}),

	// Help
	SHOW_HOTKEYS: hotkey({
		keys: "meta+slash",
		label: "Show Keyboard Shortcuts",
		category: "Help",
	}),
} as const satisfies Record<string, HotkeyDefinition & { display: string[] }>;

export type HotkeyId = keyof typeof HOTKEYS;

export type HotkeyWithDisplay = HotkeyDefinition & { display: string[] };

/**
 * Get all hotkeys grouped by category for display purposes.
 */
export function getHotkeysByCategory(): Record<
	HotkeyCategory,
	HotkeyWithDisplay[]
> {
	const grouped: Record<HotkeyCategory, HotkeyWithDisplay[]> = {
		Workspace: [],
		Layout: [],
		Terminal: [],
		Window: [],
		Help: [],
	};

	for (const hotkey of Object.values(HOTKEYS)) {
		grouped[hotkey.category].push(hotkey);
	}

	return grouped;
}

/**
 * Check if a keyboard event matches a hotkey string like "meta+shift+d"
 */
function matchesHotkey(event: KeyboardEvent, hotkeyString: string): boolean {
	const parts = hotkeyString.toLowerCase().split("+");

	const requiresMeta = parts.includes("meta");
	const requiresShift = parts.includes("shift");
	const requiresAlt = parts.includes("alt");
	const requiresCtrl = parts.includes("ctrl");

	// Get the actual key (last part that's not a modifier)
	const key = parts.find((p) => !["meta", "shift", "alt", "ctrl"].includes(p));

	if (!key) return false;

	const hasMeta = event.metaKey;
	const hasShift = event.shiftKey;
	const hasAlt = event.altKey;
	const hasCtrl = event.ctrlKey;

	if (requiresMeta !== hasMeta) return false;
	if (requiresShift !== hasShift) return false;
	if (requiresAlt !== hasAlt) return false;
	if (requiresCtrl !== hasCtrl) return false;

	// Match the key
	const eventKey = event.key.toLowerCase();
	const eventCode = event.code.toLowerCase();

	// Arrow keys
	if (key === "up" && eventKey === "arrowup") return true;
	if (key === "down" && eventKey === "arrowdown") return true;
	if (key === "left" && eventKey === "arrowleft") return true;
	if (key === "right" && eventKey === "arrowright") return true;

	// Special characters - check both key and code (code is more reliable with modifiers)
	if (
		(key === "/" || key === "slash") &&
		(eventKey === "/" || eventCode === "slash")
	)
		return true;

	// Direct match (letters, numbers)
	if (eventKey === key) return true;

	return false;
}

/**
 * Find which hotkey ID matches the keyboard event, if any
 */
function findMatchingHotkey(event: KeyboardEvent): HotkeyId | null {
	for (const [id, hotkey] of Object.entries(HOTKEYS)) {
		if (matchesHotkey(event, hotkey.keys)) {
			return id as HotkeyId;
		}
	}
	return null;
}

/**
 * Check if an event matches any app hotkey (used by terminal to forward events)
 */
export function isAppHotkey(event: KeyboardEvent): boolean {
	return findMatchingHotkey(event) !== null;
}
