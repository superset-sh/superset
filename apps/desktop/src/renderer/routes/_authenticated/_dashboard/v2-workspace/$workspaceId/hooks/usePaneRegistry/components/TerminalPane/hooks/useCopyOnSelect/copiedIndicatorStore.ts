/**
 * Per-pane "just copied" ticks, kept out of TerminalPane's own state so a
 * copy-on-select flash re-renders the small indicator instead of the whole
 * terminal pane.
 */
const counts = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();

export const copiedIndicatorStore = {
	notify(paneId: string) {
		counts.set(paneId, (counts.get(paneId) ?? 0) + 1);
		for (const listener of listeners.get(paneId) ?? []) listener();
	},
	subscribe(paneId: string, listener: () => void) {
		let set = listeners.get(paneId);
		if (!set) {
			set = new Set();
			listeners.set(paneId, set);
		}
		set.add(listener);
		return () => {
			set.delete(listener);
			// Drop the pane's entries once nothing is listening: panes come and go
			// for the life of the window, and neither map should outlive them.
			if (set.size === 0) {
				listeners.delete(paneId);
				counts.delete(paneId);
			}
		};
	},
	getCount(paneId: string) {
		return counts.get(paneId) ?? 0;
	},
};
