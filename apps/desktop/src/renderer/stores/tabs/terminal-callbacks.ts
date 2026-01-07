import { create } from "zustand";

interface TerminalCallbacksState {
	clearCallbacks: Map<string, () => void>;
	scrollToBottomCallbacks: Map<string, () => void>;
	registerClearCallback: (paneId: string, callback: () => void) => void;
	unregisterClearCallback: (paneId: string) => void;
	getClearCallback: (paneId: string) => (() => void) | undefined;
	registerScrollToBottomCallback: (
		paneId: string,
		callback: () => void,
	) => void;
	unregisterScrollToBottomCallback: (paneId: string) => void;
	getScrollToBottomCallback: (paneId: string) => (() => void) | undefined;
}

export const useTerminalCallbacksStore = create<TerminalCallbacksState>()(
	(set, get) => ({
		clearCallbacks: new Map(),
		scrollToBottomCallbacks: new Map(),

		registerClearCallback: (paneId, callback) => {
			set((state) => {
				const newCallbacks = new Map(state.clearCallbacks);
				newCallbacks.set(paneId, callback);
				return { clearCallbacks: newCallbacks };
			});
		},

		unregisterClearCallback: (paneId) => {
			set((state) => {
				const newCallbacks = new Map(state.clearCallbacks);
				newCallbacks.delete(paneId);
				return { clearCallbacks: newCallbacks };
			});
		},

		getClearCallback: (paneId) => {
			return get().clearCallbacks.get(paneId);
		},

		registerScrollToBottomCallback: (paneId, callback) => {
			set((state) => {
				const newCallbacks = new Map(state.scrollToBottomCallbacks);
				newCallbacks.set(paneId, callback);
				return { scrollToBottomCallbacks: newCallbacks };
			});
		},

		unregisterScrollToBottomCallback: (paneId) => {
			set((state) => {
				const newCallbacks = new Map(state.scrollToBottomCallbacks);
				newCallbacks.delete(paneId);
				return { scrollToBottomCallbacks: newCallbacks };
			});
		},

		getScrollToBottomCallback: (paneId) => {
			return get().scrollToBottomCallbacks.get(paneId);
		},
	}),
);
