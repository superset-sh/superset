import { useSyncExternalStore } from "react";
import { track } from "renderer/lib/analytics";

export type RichInputToggleSource = "hotkey" | "header_button" | "escape";

/**
 * Whether the rich-input overlay is open. Global (universal on/off for every
 * terminal pane) rather than per-terminal, so the header button and the ⌘I
 * hotkey flip one shared switch that all panes reflect. Persisted to
 * localStorage so the preference survives reloads.
 */
const STORAGE_KEY = "superset.terminalRichInputOpen";

let isOpen = readPersisted();
const listeners = new Set<() => void>();

function readPersisted(): boolean {
	try {
		return localStorage.getItem(STORAGE_KEY) === "true";
	} catch {
		return false;
	}
}

function set(next: boolean, source: RichInputToggleSource) {
	if (isOpen === next) return;
	isOpen = next;
	try {
		localStorage.setItem(STORAGE_KEY, next ? "true" : "false");
	} catch {}
	track("terminal_rich_input_toggled", { open: next, source });
	for (const listener of listeners) listener();
}

export const terminalRichInputOpenStore = {
	open(source: RichInputToggleSource) {
		set(true, source);
	},
	close(source: RichInputToggleSource) {
		set(false, source);
	},
	toggle(source: RichInputToggleSource) {
		set(!isOpen, source);
	},
	subscribe(listener: () => void) {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
};

export function useTerminalRichInputOpen(): boolean {
	return useSyncExternalStore(
		terminalRichInputOpenStore.subscribe,
		() => isOpen,
	);
}
