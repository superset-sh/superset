type ClipboardShortcutEvent = Pick<
	KeyboardEvent,
	| "key"
	| "metaKey"
	| "ctrlKey"
	| "altKey"
	| "shiftKey"
	| "preventDefault"
	| "stopPropagation"
>;

function isPlainMacShortcut(
	event: Pick<
		ClipboardShortcutEvent,
		"key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
	>,
	platform: string,
	key: "c" | "v",
): boolean {
	if (event.key.toLowerCase() !== key) return false;
	if (event.altKey) return false;
	if (!platform.includes("mac")) return false;
	return event.metaKey && !event.ctrlKey && !event.shiftKey;
}

export function isTerminalCopyShortcut(
	event: Pick<
		ClipboardShortcutEvent,
		"key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
	>,
	platform: string,
): boolean {
	return isPlainMacShortcut(event, platform, "c");
}

export function isTerminalPasteShortcut(
	event: Pick<
		ClipboardShortcutEvent,
		"key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
	>,
	platform: string,
): boolean {
	return isPlainMacShortcut(event, platform, "v");
}

/**
 * Handle terminal clipboard shortcuts directly so copy/paste does not depend on
 * the browser generating native clipboard events for the focused textarea.
 */
export function handleTerminalClipboardShortcut(
	event: ClipboardShortcutEvent,
	platform: string,
	handlers: {
		onCopy: () => void | Promise<void>;
		onPaste: () => void | Promise<void>;
	},
): boolean {
	if (isTerminalCopyShortcut(event, platform)) {
		event.preventDefault();
		event.stopPropagation();
		void Promise.resolve(handlers.onCopy()).catch(() => {});
		return true;
	}

	if (isTerminalPasteShortcut(event, platform)) {
		event.preventDefault();
		event.stopPropagation();
		void Promise.resolve(handlers.onPaste()).catch(() => {});
		return true;
	}

	return false;
}
