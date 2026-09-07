import {
	canonicalizeChord,
	chordFromInput,
	type ForwardedKey,
} from "shared/hotkey-chord";
import { getDispatchChord } from "../hooks/useBinding/useBinding";
import type { HotkeyId } from "../registry";

/**
 * Hotkeys the host replays when an embedded document (a guest webview, a
 * page pane's iframe) had focus for the keystroke. Scoped to tab switching,
 * zoom and closing the pane: none has a registered menu accelerator (so a
 * replay can't double-fire) and none is a page shortcut worth keeping. The
 * main process is synced these chords so it suppresses and forwards only
 * them; everything else stays in the page (copy, paste, find, …).
 */
export const FORWARDED_HOTKEYS: ReadonlySet<HotkeyId> = new Set<HotkeyId>([
	"ZOOM_IN",
	"ZOOM_OUT",
	"ZOOM_RESET",
	"PREV_TAB",
	"NEXT_TAB",
	"PREV_TAB_ALT",
	"NEXT_TAB_ALT",
	"JUMP_TO_TAB_1",
	"JUMP_TO_TAB_2",
	"JUMP_TO_TAB_3",
	"JUMP_TO_TAB_4",
	"JUMP_TO_TAB_5",
	"JUMP_TO_TAB_6",
	"JUMP_TO_TAB_7",
	"JUMP_TO_TAB_8",
	"JUMP_TO_TAB_9",
	"CLOSE_PANE",
]);

/** Canonical chords of {@link FORWARDED_HOTKEYS} under the current bindings. */
export function getForwardableChords(): string[] {
	const chords: string[] = [];
	for (const id of FORWARDED_HOTKEYS) {
		const chord = getDispatchChord(id);
		if (chord) chords.push(canonicalizeChord(chord));
	}
	return chords;
}

/**
 * Replay a forwarded keystroke onto the host document so `react-hotkeys-hook`
 * picks it up. Re-gated against the current bindings in case the main
 * process's chord set lags a remap. Returns whether it was replayed.
 */
export function replayForwardedKey(key: ForwardedKey): boolean {
	const chord = chordFromInput(key);
	if (!chord || !getForwardableChords().includes(chord)) return false;
	const init: KeyboardEventInit = {
		key: key.key,
		code: key.code,
		metaKey: key.meta,
		ctrlKey: key.control,
		altKey: key.alt,
		shiftKey: key.shift,
		bubbles: true,
		cancelable: true,
	};
	document.dispatchEvent(new KeyboardEvent("keydown", init));
	// keyup balances react-hotkeys-hook's pressed-key set; without it the key
	// stays stuck as "pressed".
	document.dispatchEvent(new KeyboardEvent("keyup", init));
	return true;
}
