/**
 * Keyboard shortcuts module
 * Central place for all keyboard shortcut definitions and handling
 */

export type ModifierKey = "meta" | "ctrl" | "alt" | "shift";

export interface KeyboardShortcut {
	key: string;
	modifiers?: ModifierKey[];
	description: string;
	handler: (event: KeyboardEvent) => boolean | void;
}

export interface KeyboardShortcutGroup {
	name: string;
	shortcuts: KeyboardShortcut[];
}

/**
 * Check if event matches the shortcut definition
 */
export function matchesShortcut(
	event: KeyboardEvent,
	shortcut: KeyboardShortcut,
): boolean {
	// Check key match (case insensitive)
	if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) {
		return false;
	}

	// Check modifiers
	const modifiers = shortcut.modifiers || [];
	const hasCtrl = modifiers.includes("ctrl");
	const hasMeta = modifiers.includes("meta");
	const hasAlt = modifiers.includes("alt");
	const hasShift = modifiers.includes("shift");

	return (
		event.ctrlKey === hasCtrl &&
		event.metaKey === hasMeta &&
		event.altKey === hasAlt &&
		event.shiftKey === hasShift
	);
}

/**
 * Create a keyboard event handler that processes multiple shortcuts
 */
export function createShortcutHandler(shortcuts: KeyboardShortcut[]) {
	return (event: KeyboardEvent): boolean => {
		for (const shortcut of shortcuts) {
			if (matchesShortcut(event, shortcut)) {
				const result = shortcut.handler(event);
				// If handler returns false, prevent default and stop propagation
				if (result === false) {
					event.preventDefault();
					return false;
				}
			}
		}
		// Allow event to propagate normally
		return true;
	};
}

/**
 * Format shortcut for display (e.g., "Cmd+K" or "Ctrl+Shift+P")
 */
export function formatShortcut(shortcut: KeyboardShortcut): string {
	const modifiers = shortcut.modifiers || [];
	const parts: string[] = [];

	// Use platform-specific display names
	const isMac = navigator.platform.toLowerCase().includes("mac");

	for (const mod of modifiers) {
		switch (mod) {
			case "meta":
				parts.push(isMac ? "Cmd" : "Win");
				break;
			case "ctrl":
				parts.push("Ctrl");
				break;
			case "alt":
				parts.push(isMac ? "Opt" : "Alt");
				break;
			case "shift":
				parts.push("Shift");
				break;
		}
	}

	parts.push(shortcut.key.toUpperCase());

	return parts.join("+");
}
