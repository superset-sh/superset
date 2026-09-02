import { useCallback, useSyncExternalStore } from "react";
import { browserRuntimeRegistry } from "./browserRuntimeRegistry";

/**
 * Per-pane find-in-page visibility. Lives outside React because the toolbar's
 * "Find in page" menu item and the pane body's floating find bar are separate
 * component trees that both need the same open/closed state.
 */
class FindBarStoreImpl {
	private openPaneIds = new Set<string>();
	private listeners = new Map<string, Set<() => void>>();

	isOpen(paneId: string): boolean {
		return this.openPaneIds.has(paneId);
	}

	subscribe(paneId: string, listener: () => void): () => void {
		let set = this.listeners.get(paneId);
		if (!set) {
			set = new Set();
			this.listeners.set(paneId, set);
		}
		set.add(listener);
		return () => {
			set.delete(listener);
		};
	}

	private notify(paneId: string): void {
		const listeners = this.listeners.get(paneId);
		if (!listeners) return;
		for (const listener of listeners) listener();
	}

	open(paneId: string): void {
		if (this.openPaneIds.has(paneId)) return;
		this.openPaneIds.add(paneId);
		this.notify(paneId);
	}

	close(paneId: string): void {
		if (!this.openPaneIds.delete(paneId)) return;
		browserRuntimeRegistry.stopFindInPage(paneId, "clearSelection");
		this.notify(paneId);
	}

	toggle(paneId: string): void {
		if (this.openPaneIds.has(paneId)) this.close(paneId);
		else this.open(paneId);
	}
}

export const findBarStore = new FindBarStoreImpl();

export function useFindBarOpen(paneId: string): boolean {
	return useSyncExternalStore(
		useCallback((cb) => findBarStore.subscribe(paneId, cb), [paneId]),
		useCallback(() => findBarStore.isOpen(paneId), [paneId]),
	);
}
