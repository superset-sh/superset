import { create } from "zustand";

interface TerminalCallbacksState {
	clearCallbacks: Map<string, () => void>;
	registerClearCallback: (paneId: string, callback: () => void) => void;
	unregisterClearCallback: (paneId: string) => void;
	getClearCallback: (paneId: string) => (() => void) | undefined;
}

export const useTerminalCallbacksStore = create<TerminalCallbacksState>()(
	(set, get) => ({
		clearCallbacks: new Map(),

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
	}),
);
