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

// Process-lifetime subscription. If it errors, retry with backoff —
// otherwise `map` would stay null until window reload and every hotkey
// label would silently fall back to US-ANSI glyphs.
const RETRY_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000];
let retryAttempt = 0;

function startKeyboardLayoutSync(): void {
	electronTrpcClient.keyboardLayout.changes.subscribe(undefined, {
		onData: (data) => {
			retryAttempt = 0;
			applySnapshot(data);
		},
		onError: (err) => {
			console.error("[keyboardLayoutStore] subscription error:", err);
			const idx = Math.min(retryAttempt, RETRY_BACKOFF_MS.length - 1);
			const delay = RETRY_BACKOFF_MS[idx] ?? 10_000;
			retryAttempt++;
			setTimeout(startKeyboardLayoutSync, delay);
		},
	});
}

startKeyboardLayoutSync();
