import {
	canonicalizeChord,
	chordFromInput,
	type ForwardedKey,
} from "shared/hotkey-chord";
import { getDispatchChord } from "../hooks/useBinding/useBinding";
import type { HotkeyId } from "../registry";

/**
 * Hotkeys the host replays when an embedded document (a guest webview, a
 * page pane's iframe) had focus for the keystroke. Shell actions must work
 * from embedded content just as they do from a pane header. Keep this list
 * shared between both surfaces and resolve the user's current bindings.
 * Native menu accelerators and document actions (copy, paste, find, undo,
 * reload, …) keep their existing handling instead of being replayed here.
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
	"CLOSE_TAB",
	"REOPEN_TAB",
	"SPLIT_RIGHT",
	"SPLIT_DOWN",
	"SPLIT_AUTO",
	"SPLIT_WITH_BROWSER",
	"SPLIT_WITH_DESKTOP",
	"EQUALIZE_PANE_SPLITS",
	"FOCUS_PANE_LEFT",
	"FOCUS_PANE_RIGHT",
	"FOCUS_PANE_UP",
	"FOCUS_PANE_DOWN",
	"TOGGLE_SIDEBAR",
	"TOGGLE_WORKSPACE_SIDEBAR",
	"NEW_GROUP",
	"NEW_BROWSER",
	"OPEN_DIFF_VIEWER",
	"QUICK_OPEN",
	"OPEN_COMMAND_PALETTE",
	"CHECK_RESOURCES",
	"NEW_WORKSPACE",
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
