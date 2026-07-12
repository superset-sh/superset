import { useSyncExternalStore } from "react";

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

function set(next: boolean) {
	if (isOpen === next) return;
	isOpen = next;
	try {
		localStorage.setItem(STORAGE_KEY, next ? "true" : "false");
	} catch {}
	for (const listener of listeners) listener();
}

export const terminalRichInputOpenStore = {
	open() {
		set(true);
	},
	close() {
		set(false);
	},
	toggle() {
		set(!isOpen);
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
