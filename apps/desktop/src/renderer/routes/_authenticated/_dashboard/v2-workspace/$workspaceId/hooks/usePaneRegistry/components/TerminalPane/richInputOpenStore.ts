import { useSyncExternalStore } from "react";

/**
 * Which terminals currently have the rich-input overlay open, keyed by
 * terminalId and module-scoped like the draft map (see TerminalRichInput) so
 * open/closed survives the mounted pane being re-pointed at another terminal
 * (tab switch, session dropdown). Shared here rather than held as pane-local
 * state so the header button and the ⌘I hotkey toggle the same thing.
 */
const openTerminalIds = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

export const terminalRichInputOpenStore = {
	open(terminalId: string) {
		if (openTerminalIds.has(terminalId)) return;
		openTerminalIds.add(terminalId);
		emit();
	},
	close(terminalId: string) {
		if (!openTerminalIds.delete(terminalId)) return;
		emit();
	},
	toggle(terminalId: string) {
		if (openTerminalIds.has(terminalId)) openTerminalIds.delete(terminalId);
		else openTerminalIds.add(terminalId);
		emit();
	},
	subscribe(listener: () => void) {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
};

export function useTerminalRichInputOpen(terminalId: string): boolean {
	return useSyncExternalStore(terminalRichInputOpenStore.subscribe, () =>
		openTerminalIds.has(terminalId),
	);
}
