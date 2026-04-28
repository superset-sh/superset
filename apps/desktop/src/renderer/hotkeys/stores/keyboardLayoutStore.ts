import type { KeyboardLayoutData } from "main/lib/keyboardLayout";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { create } from "zustand";

// Mirror of the main-process layout service for synchronous reads from
// React. Lives in main because macOS input-source switches (menu-bar
// picker, Cmd+Space) don't fire navigator.keyboard's `layoutchange` —
// native-keymap hooks the OS-level
// kTISNotifySelectedKeyboardInputSourceChanged distributed notification,
// which fires for every input-source change.

interface State {
	/** Map<event.code, unshifted glyph>. Null until the first tRPC payload
	 *  arrives (~10ms after window load); display falls back to US-ANSI
	 *  glyphs while null. */
	map: ReadonlyMap<string, string> | null;
	/** OS-specific layout id, e.g. "com.apple.keylayout.German". */
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

// Process-lifetime subscription; no teardown needed — the renderer process
// exits with the window.
electronTrpcClient.keyboardLayout.changes.subscribe(undefined, {
	onData: applySnapshot,
	onError: (err) => {
		console.error("[keyboardLayoutStore] subscription error:", err);
	},
});
