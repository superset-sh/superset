import type { KeyboardLayoutData } from "main/lib/keyboardLayout";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { create } from "zustand";

// Subscribed to the main-process keyboard layout service via tRPC. The main
// process owns the source of truth (native-keymap), and this store mirrors
// it for synchronous reads from React components.
//
// Why main-process: macOS input-source switches (menu-bar picker, Cmd+Space)
// don't fire navigator.keyboard's `layoutchange` event. native-keymap hooks
// the OS-level kTISNotifySelectedKeyboardInputSourceChanged distributed
// notification, which fires for every input-source change.

interface State {
	/** Map<event.code, unshifted glyph> for the current OS layout. Null until
	 *  the first tRPC payload arrives (~10ms after window load). Display
	 *  falls back to KEY_DISPLAY (US-ANSI) while null. */
	map: ReadonlyMap<string, string> | null;
	/** OS-specific layout id, e.g. "com.apple.keylayout.German". Empty before
	 *  first payload. Authoritative — replaces hand-rolled fingerprinting. */
	layoutId: string;
}

export const useKeyboardLayoutStore = create<State>(() => ({
	map: null,
	layoutId: "",
}));

function applySnapshot(data: KeyboardLayoutData): void {
	useKeyboardLayoutStore.setState({
		map: new Map(Object.entries(data.unshifted)),
		layoutId: data.layoutId,
	});
}

// Subscribe at module load. The subscription is process-lifetime; no
// teardown needed (renderer process exits with the window).
electronTrpcClient.keyboardLayout.changes.subscribe(undefined, {
	onData: applySnapshot,
	onError: (err) => {
		console.error("[keyboardLayoutStore] subscription error:", err);
	},
});
