import { useEffect } from "react";
import {
	getForwardableChords,
	replayForwardedKey,
	useHotkeyOverridesStore,
	useKeyboardPreferencesStore,
} from "renderer/hotkeys";
import { useKeyboardLayoutStore } from "renderer/hotkeys/stores/keyboardLayoutStore";
import { electronTrpcClient } from "renderer/lib/trpc-client";

/**
 * Keeps hotkeys working while an embedded document has keyboard focus.
 *
 * Syncs the main process's forwardable-chord set with the current bindings —
 * it suppresses exactly those chords in focused guest webviews and host
 * iframes and hands them back — and replays the ones intercepted in this
 * window's own iframes (a page pane, the PDF viewer). Guest webviews replay
 * theirs per pane, where the pane id is known.
 */
export function useForwardedHotkeys() {
	// Recomputed on the same remap / layout / preference changes that rebuild
	// the hotkey resolver's index.
	useEffect(() => {
		const push = () => {
			electronTrpcClient.browser.setForwardableChords
				.mutate({ chords: getForwardableChords() })
				.catch((error) => {
					// Stale main-process suppression means embedded-focus hotkeys
					// silently stop working — leave a trace.
					console.warn("[hotkeys] failed to sync forwardable chords", error);
				});
		};
		push();
		const unsubs = [
			useHotkeyOverridesStore.subscribe(push),
			useKeyboardLayoutStore.subscribe(push),
			useKeyboardPreferencesStore.subscribe(push),
		];
		return () => {
			for (const unsub of unsubs) unsub();
		};
	}, []);

	useEffect(() => {
		const sub = electronTrpcClient.browser.onHostKeyForward.subscribe(
			undefined,
			{ onData: replayForwardedKey },
		);
		return () => sub.unsubscribe();
	}, []);
}
