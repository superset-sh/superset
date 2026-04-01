import { create } from "zustand";

interface TerminalCallbacksState {
	clearCallbacks: Map<string, () => void>;
	scrollToBottomCallbacks: Map<string, () => void>;
	getSelectionCallbacks: Map<string, () => string>;
	pasteCallbacks: Map<string, (text: string) => void>;
	registerClearCallback: (paneId: string, callback: () => void) => void;
	unregisterClearCallback: (paneId: string) => void;
	getClearCallback: (paneId: string) => (() => void) | undefined;
	registerScrollToBottomCallback: (
		paneId: string,
		callback: () => void,
	) => void;
	unregisterScrollToBottomCallback: (paneId: string) => void;
	getScrollToBottomCallback: (paneId: string) => (() => void) | undefined;
	registerGetSelectionCallback: (
		paneId: string,
		callback: () => string,
	) => void;
	unregisterGetSelectionCallback: (paneId: string) => void;
	getGetSelectionCallback: (paneId: string) => (() => string) | undefined;
	registerPasteCallback: (
		paneId: string,
		callback: (text: string) => void,
	) => void;
	unregisterPasteCallback: (paneId: string) => void;
	getPasteCallback: (paneId: string) => ((text: string) => void) | undefined;
}

export const useTerminalCallbacksStore = create<TerminalCallbacksState>()(
	(set, get) => ({
		clearCallbacks: new Map(),
		scrollToBottomCallbacks: new Map(),
		getSelectionCallbacks: new Map(),
		pasteCallbacks: new Map(),

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

		registerGetSelectionCallback: (paneId, callback) => {
			set((state) => {
				const newCallbacks = new Map(state.getSelectionCallbacks);
				newCallbacks.set(paneId, callback);
				return { getSelectionCallbacks: newCallbacks };
			});
		},

		unregisterGetSelectionCallback: (paneId) => {
			set((state) => {
				const newCallbacks = new Map(state.getSelectionCallbacks);
				newCallbacks.delete(paneId);
				return { getSelectionCallbacks: newCallbacks };
			});
		},

		getGetSelectionCallback: (paneId) => {
			return get().getSelectionCallbacks.get(paneId);
		},

		registerPasteCallback: (paneId, callback) => {
			set((state) => {
				const newCallbacks = new Map(state.pasteCallbacks);
				newCallbacks.set(paneId, callback);
				return { pasteCallbacks: newCallbacks };
			});
		},

		unregisterPasteCallback: (paneId) => {
			set((state) => {
				const newCallbacks = new Map(state.pasteCallbacks);
				newCallbacks.delete(paneId);
				return { pasteCallbacks: newCallbacks };
			});
		},

		getPasteCallback: (paneId) => {
			return get().pasteCallbacks.get(paneId);
		},
	}),
);
